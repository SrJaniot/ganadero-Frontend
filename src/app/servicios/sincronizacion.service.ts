import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, Subscription } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { RespuestaServerCambios, RespuestaServerObtenerSincronizaciones, RespuestaServerSincronizar } from '../Modelos/GanaderoModel';
import { AlmacenLocalService } from './almacen-local';
import { FincaActualService } from './finca-actual.service';
import { SeguridadService } from './seguridad';

//ESTADO DE LA SINCRONIZACION PARA EL INDICADOR DE ARRIBA Y LA PANTALLA "SINCRONIZAR"
export interface EstadoSincronizacion {
  enLinea: boolean;
  sincronizando: boolean;
  pendientes: number;
  rechazados: number;
  ultimaSincronizacion: string | null;  //ISO, HORA DEL CELULAR (SOLO PARA MOSTRAR; LA MARCA DE VERDAD ES LA DEL SERVIDOR)
  error: string | null;                 //POR QUE NO SE PUDO TERMINAR LA ULTIMA VEZ
}

// MOTOR DE SINCRONIZACION (PLAN_GANADERO.md, SECCION 4). DOS PASOS Y SIEMPRE EN ESTE ORDEN:
//   1. SUBIR: LA BANDEJA EN LOTES DE 50 A /SincronizarRegistros (CADA REGISTRO RESPONDE OK, YA_EXISTIA O RECHAZADO)
//   2. BAJAR: /ObtenerCambiosDesde CON LA MARCA DEL SERVIDOR DE LA ULTIMA BAJADA (null LA PRIMERA VEZ = FINCA COMPLETA)
// SE DISPARA AL ABRIR, AL VOLVER LA SEÑAL, CADA 5 MINUTOS CON CONEXION Y UNOS SEGUNDOS DESPUES DE CADA REGISTRO
// SI LA RED FALLA A MEDIAS NO SE PIERDE NADA: LO QUE NO TUVO RESPUESTA SIGUE EN LA BANDEJA Y SE REENVIA (EL UUID EVITA DUPLICADOS)
@Injectable({
  providedIn: 'root'
})
export class SincronizacionService {
  private url = ConfiguracionRutasBackend.url_backend_ms_negocio;
  private readonly tamanoLote = 50;
  private readonly cadaCuanto = 5 * 60 * 1000;
  private temporizadorProgramado: any = null;
  private suscripcionBandeja: Subscription | null = null;

  readonly estado$ = new BehaviorSubject<EstadoSincronizacion>({
    enLinea: navigator.onLine, sincronizando: false, pendientes: 0, rechazados: 0, ultimaSincronizacion: null, error: null,
  });

  constructor(
    private http: HttpClient,
    private almacenLocal: AlmacenLocalService,
    private fincaActual: FincaActualService,
    private seguridadService: SeguridadService,
  ) {
    window.addEventListener('online', () => { this.cambiarEstado({ enLinea: true }); this.sincronizar(); });
    window.addEventListener('offline', () => this.cambiarEstado({ enLinea: false }));
    setInterval(() => this.sincronizar(), this.cadaCuanto);
    //AL CAMBIAR DE FINCA SE OBSERVA SU BANDEJA Y SE SINCRONIZA
    this.fincaActual.finca$.subscribe(finca => {
      this.suscripcionBandeja?.unsubscribe();
      this.suscripcionBandeja = null;
      if (finca) {
        this.suscripcionBandeja = this.almacenLocal.observarBandeja().subscribe(conteo => this.cambiarEstado(conteo));
        this.almacenLocal.leerMeta<string>('ULTIMA_SINCRONIZACION').then(ultima => this.cambiarEstado({ ultimaSincronizacion: ultima }));
        this.sincronizar();
      }
    });
    //CUANDO LA PERSONA VUELVE A ESCRIBIR SU CLAVE, SE SUBE LO QUE ESPERABA
    this.seguridadService.necesitaClave.subscribe(falta => {
      if (!falta) {
        this.sincronizar();
      }
    });
  }

  private getHeaders(): HttpHeaders {
    const token = this.seguridadService.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  private cambiarEstado(cambios: Partial<EstadoSincronizacion>) {
    this.estado$.next({ ...this.estado$.value, ...cambios });
  }

  //---------------------------------------------HTTP--------------------------------------------------------------------------

  SincronizarRegistros(id_finca: number, registros: any[]): Observable<RespuestaServerSincronizar> {
    return this.http.post<RespuestaServerSincronizar>(this.url + 'SincronizarRegistros', { id_finca, registros }, { headers: this.getHeaders() });
  }

  ObtenerCambiosDesde(id_finca: number, desde: string | null): Observable<RespuestaServerCambios> {
    return this.http.post<RespuestaServerCambios>(this.url + 'ObtenerCambiosDesde', { id_finca, desde }, { headers: this.getHeaders() });
  }

  ObtenerSincronizaciones(id_finca: number): Observable<RespuestaServerObtenerSincronizaciones> {
    return this.http.get<RespuestaServerObtenerSincronizaciones>(this.url + 'ObtenerSincronizaciones/' + id_finca, { headers: this.getHeaders() });
  }

  //---------------------------------------------MOTOR------------------------------------------------------------------------

  //DESPUES DE REGISTRAR ALGO: SE ESPERA UN POCO POR SI LA PERSONA REGISTRA VARIAS COSAS SEGUIDAS (ORDEÑO EN LOTE)
  programar(): void {
    clearTimeout(this.temporizadorProgramado);
    this.temporizadorProgramado = setTimeout(() => this.sincronizar(), 3000);
  }

  //SUBE Y BAJA. DEVUELVE true SI TERMINO BIEN. NUNCA LANZA ERROR: LO DEJA EN estado$.error
  async sincronizar(): Promise<boolean> {
    const finca = this.fincaActual.actual;
    const estado = this.estado$.value;
    if (!finca || estado.sincronizando || !this.almacenLocal.abierta) {
      return false;
    }
    if (!navigator.onLine) {
      this.cambiarEstado({ enLinea: false });
      return false;
    }
    if (this.seguridadService.necesitaClave.value) {
      this.cambiarEstado({ error: 'Escribe tu clave para sincronizar' });
      return false;
    }
    this.cambiarEstado({ sincronizando: true, error: null, enLinea: true });
    try {
      //1. SUBIR, LOTE POR LOTE, HASTA VACIAR LO PENDIENTE
      //SI UN REGISTRO YA ENVIADO VUELVE A SALIR (LA RESPUESTA NO LO RESOLVIO), SE CORTA: NUNCA SE QUEDA REENVIANDO EN CIRCULO
      const enviados = new Set<number>();
      while (true) {
        const lote = await this.almacenLocal.pendientes(this.tamanoLote);
        if (lote.length === 0) {
          break;
        }
        if (lote.some(r => enviados.has(r.orden!))) {
          this.cambiarEstado({ error: 'Algunos registros no recibieron respuesta. Se reintentará después' });
          return false;
        }
        lote.forEach(r => enviados.add(r.orden!));
        const registros = lote.map(r => ({ orden: r.orden, uuid: r.uuid, tipo: r.tipo, operacion: r.operacion, datos: r.datos }));
        const respuesta = await firstValueFrom(this.SincronizarRegistros(finca.idFinca, registros));
        if (respuesta.CODIGO !== 200 || !respuesta.DATOS) {
          //LA FINCA NO EXISTE O YA NO TRABAJA AHI: NADA SE BORRA DE LA BANDEJA
          this.cambiarEstado({ error: respuesta.MENSAJE || 'No se pudo subir' });
          return false;
        }
        await this.almacenLocal.aplicarResultados(respuesta.DATOS);
        //SI TODO EL LOTE QUEDO RECHAZADO, pendientes() YA NO LO DEVUELVE Y EL CICLO SIGUE CON EL RESTO
      }

      //2. BAJAR DESDE LA MARCA DEL SERVIDOR
      const marca = await this.almacenLocal.leerMeta<string>('MARCA');
      const cambios = await firstValueFrom(this.ObtenerCambiosDesde(finca.idFinca, marca));
      if (cambios.CODIGO !== 200 || !cambios.DATOS) {
        this.cambiarEstado({ error: cambios.MENSAJE || 'No se pudo bajar lo de la finca' });
        return false;
      }
      await this.almacenLocal.aplicarCambios(cambios.DATOS);
      //EL DUEÑO PUDO CAMBIAR EL ROL O EL NOMBRE DE LA FINCA
      const nombre = cambios.DATOS.FINCA?.NOM_FINCA ?? finca.nombre;
      if (cambios.DATOS.ROL_FINCA !== finca.rol || nombre !== finca.nombre) {
        this.fincaActual.actualizar({ rol: cambios.DATOS.ROL_FINCA, nombre });
      }
      const ahora = new Date().toISOString();
      await this.almacenLocal.guardarMeta('ULTIMA_SINCRONIZACION', ahora);
      this.cambiarEstado({ ultimaSincronizacion: ahora });
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        //EL TOKEN VENCIO: SE PIDE LA CLAVE Y LA BANDEJA QUEDA INTACTA
        this.seguridadService.MarcarNecesitaClave();
        this.cambiarEstado({ error: 'Escribe tu clave para sincronizar' });
      } else if (err instanceof HttpErrorResponse && err.status === 0) {
        this.cambiarEstado({ error: 'No hay conexión con el servidor', enLinea: navigator.onLine });
      } else {
        this.cambiarEstado({ error: 'Algo falló al sincronizar. Lo registrado sigue guardado en el celular' });
      }
      return false;
    } finally {
      this.cambiarEstado({ sincronizando: false });
    }
  }
}
