import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ConfiguracionRutasBackend } from '../../config/configuracion.rutas.backend';
import { RespuestaServer } from '../../Modelos/RespuestaServer.model';
import { UsuarioValidadoModel } from '../../Modelos/UsuarioValidado.model';
import { SeguridadService } from '../../servicios/seguridad';
import { ahoraLocal } from '../../servicios/hato.service';

type RolDemo = 'DUENIO' | 'VAQUERO' | 'VETERINARIO';
type Seccion = 'login' | 'consulta' | 'seguridad' | 'pesaje' | 'cierre';

interface Peticion {
  titulo: string;
  metodo: 'GET' | 'POST';
  url: string;
  token?: string | null;
  cuerpo?: unknown;
  funcion?: string;
  explicacion?: string;
}

interface Ejecucion {
  titulo: string;
  metodo: string;
  urlCompleta: string;
  cabeceras: [string, string][];
  cuerpo: string | null;
  estado: number;
  textoEstado: string;
  ms: number;
  tipoContenido: string;
  respuesta: string;
  respuestaCorta: string;
  esLarga: boolean;
  verCompleta: boolean;
  exito: boolean;
  funcion?: string;
  explicacion?: string;
}

const LINEAS_RESPUESTA = 26;

//LABORATORIO DE LA API (SOLO EN LA DEMO): LANZA PETICIONES REALES Y MUESTRA POR DENTRO LO QUE VA Y LO QUE VUELVE
//USA fetch Y NO HttpClient A PROPOSITO: EL INTERCEPTOR DE LA APP CIERRA LA SESION ANTE UN 401, Y AQUI EL 401 ES PARTE DE LO QUE SE QUIERE MOSTRAR
@Component({
  selector: 'app-laboratorio',
  standalone: false,
  templateUrl: './laboratorio.component.html',
})
export class LaboratorioComponent implements OnInit {
  readonly urlSeguridad = ConfiguracionRutasBackend.url_backend_ms_seguridad;
  readonly urlLogica = ConfiguracionRutasBackend.url_backend_ms_negocio;
  readonly roles: { rol: RolDemo; texto: string }[] = [
    { rol: 'DUENIO', texto: 'Dueño' },
    { rol: 'VAQUERO', texto: 'Vaquero' },
    { rol: 'VETERINARIO', texto: 'Veterinario' },
  ];

  cargando = true;
  esDemo = false;
  ocupado: string | null = null;
  token: string | null = null;
  usuario: { id_usuario: string; nombre: string; rolid: number } | null = null;

  jwtCabecera = '';
  jwtContenido = '';
  jwtVence = '';
  sesionGuardada = '';

  idFinca: number | null = null;
  nomFinca = '';
  animal: { uuid: string; etiqueta: string } | null = null;
  uuidPesaje: string | null = null;

  resultados: Record<Seccion, Ejecucion[]> = { login: [], consulta: [], seguridad: [], pesaje: [], cierre: [] };

  constructor(private seguridadService: SeguridadService, private cd: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    try {
      const r = await fetch(this.urlSeguridad + 'demo-activa');
      const datos = await r.json();
      this.esDemo = datos?.CODIGO === 200 && !!datos?.DATOS?.activa;
    } catch {
      this.esDemo = false;
    }
    if (this.esDemo) this.leerSesion();
    this.cargando = false;
    this.cd.detectChanges();
  }

  get tokenCorto(): string {
    return this.recortar(this.token);
  }

  //---------------------------------------------------------------- 1. LOGIN Y SESION
  //EL MISMO CAMINO DE LOS BOTONES DEL INGRESO: PEDIR LA SESION, GUARDARLA EN localStorage Y ARMAR EL MENU
  async entrar(rol: RolDemo): Promise<void> {
    await this.correr('entrar-' + rol, async () => {
      const { ejecucion, datos } = await this.lanzar({
        titulo: 'Iniciar sesión como ' + rol.toLowerCase(),
        metodo: 'POST',
        url: this.urlSeguridad + 'entrar-demo',
        cuerpo: { rol },
        explicacion: 'ms-seguridad busca la cuenta, firma un JWT, registra la sesión en la tabla login y responde el usuario, el token y sus permisos por menú.',
      });
      this.resultados.login = [ejecucion];
      this.resultados.cierre = [];
      if (datos?.CODIGO === 200) {
        this.limpiarSesionLocal();
        this.seguridadService.AlmacenarDatosUsuarioIdentificadoSESION(datos as RespuestaServer);
        this.seguridadService.ConstruirMenuLateral(datos.DATOS.menu);
        this.idFinca = null;
        this.animal = null;
        this.uuidPesaje = null;
        this.leerSesion();
      }
    });
  }

  private leerSesion(): void {
    const crudo = localStorage.getItem('datosSesion');
    if (!crudo) {
      this.token = null;
      this.usuario = null;
      this.jwtCabecera = this.jwtContenido = this.jwtVence = this.sesionGuardada = '';
      return;
    }
    const sesion = JSON.parse(crudo);
    this.token = sesion.token;
    this.usuario = sesion.usuario;
    const partes = String(sesion.token).split('.');
    const cabecera = this.decodificar(partes[0]);
    const contenido = this.decodificar(partes[1]);
    this.jwtCabecera = JSON.stringify(cabecera, null, 2);
    this.jwtContenido = JSON.stringify(contenido, null, 2);
    this.jwtVence = contenido?.exp ? new Date(contenido.exp * 1000).toLocaleString('es-CO') : '';
    this.sesionGuardada = JSON.stringify({
      ...sesion,
      token: this.recortar(sesion.token),
      menu: `[${sesion.menu?.length ?? 0} permisos por menú]`,
    }, null, 2);
  }

  private decodificar(parte: string): any {
    const base = parte.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  //---------------------------------------------------------------- 2. CONSULTAS CON TOKEN
  //LA FINCA Y UN ANIMAL DE EJEMPLO SE AVERIGUAN SIN MOSTRAR ESAS PETICIONES: SOLO SIRVEN PARA ARMAR LAS URL
  private async asegurarFinca(): Promise<boolean> {
    if (this.idFinca !== null && this.animal) return true;
    const h = { Authorization: 'Bearer ' + this.token };
    const fincas = await (await fetch(this.urlLogica + 'ObtenerMisFincas', { headers: h })).json();
    const finca = fincas?.DATOS?.[0];
    if (!finca) return false;
    this.idFinca = finca.ID_FINCA;
    this.nomFinca = finca.NOM_FINCA;
    const animales = await (await fetch(`${this.urlLogica}ObtenerAnimales/${finca.ID_FINCA}/ACTIVO`, { headers: h })).json();
    const a = animales?.DATOS?.[0];
    if (!a) return false;
    this.animal = { uuid: a.UUID_ANIMAL, etiqueta: `${a.CHAPETA_ANIMAL}${a.NOM_ANIMAL ? ' · ' + a.NOM_ANIMAL : ''}` };
    return true;
  }

  async consultar(que: 'fincas' | 'animales' | 'alertas' | 'indicadores'): Promise<void> {
    await this.correr('consulta-' + que, async () => {
      if (!(await this.asegurarFinca())) return;
      const f = this.idFinca;
      const def: Record<typeof que, Peticion> = {
        fincas: { titulo: 'Mis fincas', metodo: 'GET', url: this.urlLogica + 'ObtenerMisFincas', token: this.token, funcion: 'FUN_OBTENER_MIS_FINCAS_JSON($1)', explicacion: 'El usuario sale del token, no de la URL: nadie puede pedir las fincas de otra persona.' },
        animales: { titulo: 'Animales activos', metodo: 'GET', url: `${this.urlLogica}ObtenerAnimales/${f}/ACTIVO`, token: this.token, funcion: 'FUN_OBTENER_ANIMALES_JSON($1,$2,$3)', explicacion: 'La categoría de cada animal (vaca, novilla, ternero) la calcula la base de datos.' },
        alertas: { titulo: 'Alertas de hoy', metodo: 'GET', url: `${this.urlLogica}ObtenerAlertas/${f}`, token: this.token, funcion: 'FUN_OBTENER_ALERTAS_JSON($1,$2,$3::DATE)', explicacion: 'Una sola función calcula partos próximos, vacas por palpar, vacunas, retiros de leche y ciclos del ICA.' },
        indicadores: { titulo: 'Indicadores', metodo: 'POST', url: this.urlLogica + 'ObtenerIndicadores', token: this.token, cuerpo: { id_finca: f, desde: null, hasta: null }, funcion: 'FUN_OBTENER_INDICADORES_JSON($1,$2,$3::DATE,$4::DATE)', explicacion: 'Sin fechas, usa el período por defecto. La función también valida que el usuario tenga acceso a esa finca.' },
      };
      const { ejecucion } = await this.lanzar(def[que]);
      this.resultados.consulta = [ejecucion];
    });
  }

  //---------------------------------------------------------------- 3. SEGURIDAD
  async sinToken(): Promise<void> {
    await this.correr('sin-token', async () => {
      const { ejecucion } = await this.lanzar({
        titulo: 'La misma consulta, sin token', metodo: 'GET', url: this.urlLogica + 'ObtenerMisFincas',
        explicacion: 'La petición no pasa de la estrategia de autenticación: la función de PostgreSQL nunca se ejecuta.',
      });
      this.resultados.seguridad = [ejecucion];
    });
  }

  async tokenAlterado(): Promise<void> {
    await this.correr('token-alterado', async () => {
      const t = this.token!;
      const pos = t.length - 12;
      const falso = t.slice(0, pos) + (t[pos] === 'A' ? 'B' : 'A') + t.slice(pos + 1);
      const { ejecucion } = await this.lanzar({
        titulo: 'Token con un carácter cambiado', metodo: 'GET', url: this.urlLogica + 'ObtenerMisFincas', token: falso,
        explicacion: 'Se cambió un solo carácter de la firma. El servidor verifica la firma con su clave secreta y lo rechaza.',
      });
      this.resultados.seguridad = [ejecucion];
    });
  }

  //PIDE UN TOKEN DE VAQUERO APARTE: LA SESION DE ESTE NAVEGADOR NO CAMBIA
  async vaqueroPlata(): Promise<void> {
    await this.correr('vaquero-plata', async () => {
      if (!(await this.asegurarFinca())) return;
      const login = await this.lanzar({
        titulo: 'Paso 1: pedir un token de vaquero', metodo: 'POST', url: this.urlSeguridad + 'entrar-demo', cuerpo: { rol: 'VAQUERO' },
        explicacion: 'Es un token aparte; la sesión de este navegador no cambia.',
      });
      const { ejecucion } = await this.lanzar({
        titulo: 'Paso 2: el vaquero pide el dinero de la finca', metodo: 'POST', url: this.urlLogica + 'ObtenerPlata', token: login.datos?.DATOS?.token,
        cuerpo: { id_finca: this.idFinca, desde: null, hasta: null },
        explicacion: 'El token es válido, pero el rol vaquero no tiene permiso sobre ese menú. Solo el dueño ve el dinero.',
      });
      this.resultados.seguridad = [login.ejecucion, ejecucion];
    });
  }

  //---------------------------------------------------------------- 4. REGISTRAR UN PESAJE (ESCRIBE EN LA BASE DE LA DEMO; LA RESIEMBRA NOCTURNA LO BORRA)
  async pesaje(caso: 'nuevo' | 'repetido' | 'invalido'): Promise<void> {
    await this.correr('pesaje-' + caso, async () => {
      if (!(await this.asegurarFinca())) return;
      if (caso === 'nuevo' || !this.uuidPesaje) this.uuidPesaje = crypto.randomUUID();
      const uuid = caso === 'invalido' ? crypto.randomUUID() : this.uuidPesaje;
      const textos = {
        nuevo: ['Guardar un pesaje', 'El registro llega como lo envía el celular. La función valida, guarda y un trigger actualiza el peso actual del animal.'],
        repetido: ['Reenviar el mismo pesaje', 'Es lo que pasa si se cae la señal y el celular reintenta: mismo UUID, y la base no lo duplica.'],
        invalido: ['Pesaje de 5000 kg', 'La respuesta HTTP es 200 porque el envío se procesó; dentro, ese registro aparece RECHAZADO con el motivo.'],
      }[caso];
      const { ejecucion } = await this.lanzar({
        titulo: textos[0], metodo: 'POST', url: this.urlLogica + 'SincronizarRegistros', token: this.token,
        cuerpo: {
          id_finca: this.idFinca,
          registros: [{
            orden: 1, uuid, tipo: 'PESAJE', operacion: 'CREAR',
            datos: { uuid_animal: this.animal!.uuid, peso_kg: caso === 'invalido' ? 5000 : 438.5, estimado_cinta: 'NO', fecha_evento: ahoraLocal(), observacion: 'Pesaje del laboratorio' },
          }],
        },
        funcion: 'FUN_SINCRONIZAR_REGISTROS_JSON($1,$2,$3) → FUN_CREAR_PESAJE_JSON(...)',
        explicacion: textos[1],
      });
      this.resultados.pesaje = [ejecucion];
    });
  }

  //---------------------------------------------------------------- 5. CERRAR SESION Y COMPROBAR QUE EL TOKEN YA NO SIRVE
  async cerrarSesion(): Promise<void> {
    await this.correr('cerrar', async () => {
      const token = this.token!;
      const cierre = await this.lanzar({
        titulo: 'Cerrar la sesión', metodo: 'POST', url: this.urlSeguridad + 'cerrar-sesion', cuerpo: { id_usuario: this.usuario!.id_usuario, token },
        explicacion: 'El servidor marca esa sesión como inactiva en la tabla login (estado_token = false).',
      });
      const prueba = await this.lanzar({
        titulo: 'Usar otra vez el mismo token', metodo: 'GET', url: this.urlLogica + 'ObtenerMisFincas', token,
        explicacion: 'El token aún no ha vencido y su firma es correcta, pero la sesión ya está cerrada: el servidor lo rechaza.',
      });
      this.resultados.cierre = [cierre.ejecucion, prueba.ejecucion];
      this.limpiarSesionLocal();
      this.leerSesion();
      this.resultados.login = [];
      this.resultados.consulta = [];
      this.resultados.seguridad = [];
      this.resultados.pesaje = [];
      this.idFinca = null;
      this.animal = null;
      this.uuidPesaje = null;
    });
  }

  private limpiarSesionLocal(): void {
    localStorage.removeItem('datosSesion');
    localStorage.removeItem('menuLateral');
    localStorage.removeItem('fincaActual');
    this.seguridadService.ActualizarComportamientoUsuario(new UsuarioValidadoModel());
  }

  //---------------------------------------------------------------- PETICION REAL Y LO QUE SE MUESTRA DE ELLA
  private async correr(nombre: string, trabajo: () => Promise<void>): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = nombre;
    this.cd.detectChanges();
    try {
      await trabajo();
    } finally {
      this.ocupado = null;
      this.cd.detectChanges();
    }
  }

  private async lanzar(p: Peticion): Promise<{ ejecucion: Ejecucion; datos: any }> {
    const cabeceras: Record<string, string> = {};
    if (p.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (p.token) cabeceras['Authorization'] = 'Bearer ' + p.token;
    const urlCompleta = new URL(p.url, window.location.origin).href;
    const inicio = performance.now();
    let estado = 0, textoEstado = 'Sin conexión', tipoContenido = '', texto = '', datos: any = null;
    try {
      const r = await fetch(p.url, { method: p.metodo, headers: cabeceras, body: p.cuerpo !== undefined ? JSON.stringify(p.cuerpo) : undefined });
      estado = r.status;
      textoEstado = r.statusText || this.textoDeEstado(r.status);
      tipoContenido = r.headers.get('content-type') ?? '';
      texto = await r.text();
      try { datos = JSON.parse(texto); } catch { datos = null; }
    } catch {
      texto = 'No se pudo conectar con el servidor';
    }
    const ms = Math.round(performance.now() - inicio);
    const respuesta = datos !== null ? JSON.stringify(this.ocultarToken(datos), null, 2) : texto;
    const lineas = respuesta.split('\n');
    const esLarga = lineas.length > LINEAS_RESPUESTA;
    const ejecucion: Ejecucion = {
      titulo: p.titulo, metodo: p.metodo, urlCompleta,
      cabeceras: Object.entries(cabeceras).map(([k, v]) => [k, k === 'Authorization' ? 'Bearer ' + this.recortar(p.token) : v]),
      cuerpo: p.cuerpo !== undefined ? JSON.stringify(this.ocultarToken(p.cuerpo), null, 2) : null,
      estado, textoEstado, ms, tipoContenido, respuesta,
      respuestaCorta: esLarga ? lineas.slice(0, LINEAS_RESPUESTA).join('\n') + `\n… ${lineas.length - LINEAS_RESPUESTA} líneas más` : respuesta,
      esLarga, verCompleta: false,
      exito: estado >= 200 && estado < 300,
      funcion: p.funcion, explicacion: p.explicacion,
    };
    return { ejecucion, datos };
  }

  private textoDeEstado(estado: number): string {
    return ({ 200: 'OK', 401: 'Unauthorized', 404: 'Not Found', 422: 'Unprocessable Entity', 500: 'Internal Server Error' } as Record<number, string>)[estado] ?? '';
  }

  private recortar(token?: string | null): string {
    if (!token) return '';
    return token.length > 26 ? `${token.slice(0, 14)}…${token.slice(-8)}` : token;
  }

  private ocultarToken(valor: unknown): unknown {
    return JSON.parse(JSON.stringify(valor, (clave, v) => clave === 'token' && typeof v === 'string' ? this.recortar(v) : v));
  }
}
