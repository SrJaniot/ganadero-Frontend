import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RespuestaServer } from '../Modelos/RespuestaServer.model';
import { RespuestaServerSinDATA } from '../Modelos/RespuestaServerSinDATA.model';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { UsuarioValidadoModel } from '../Modelos/UsuarioValidado.model';
import { PermisoModel } from '../Modelos/Permiso.model';
import { ItemMenuModel } from '../Modelos/item.menu.model';
import { ConfiguracionMenuLateral } from '../config/configuracion.menu.latreal';
import { Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';

@Injectable({
  providedIn: 'root'
})
export class SeguridadService {
  private url_ms_seguridad : string = ConfiguracionRutasBackend.url_backend_ms_seguridad;

  constructor(
    private http: HttpClient,
    private router: Router,
    private toast: NgToastService
  ) {
    //importante para que se ejecute la validacion de la sesion
    this.validacionDeSesion();
    //AL ABRIR LA APP SE CONFIRMA CON EL BACKEND QUE EL TOKEN GUARDADO SIGA VIGENTE
    this.VerificarTokenEnServidor();
    //EL TEMPORIZADOR SE ATRASA CON EL EQUIPO SUSPENDIDO: AL VOLVER A LA PESTAÑA SE REVISA DE NUEVO
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.validacionDeSesion();
      }
    });

   }

  private getHeaders(): HttpHeaders {
    const token = this.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  /**
   * funcion que se encarga de enviar el celular y la clave al backend
   * LA CLAVE VIAJA TAL CUAL (POR HTTPS) Y EL BACKEND LA COMPARA CON BCRYPT. EL CELULAR LO NORMALIZA ms-seguridad (SIN ESPACIOS NI +57)
   * @param celular
   * @param clave
   * @returns
   */
  IdentificarUsuario(celular: string, clave: string):Observable <RespuestaServer>{
    return this.http.post<RespuestaServer>(this.url_ms_seguridad + 'identificar-usuario-SIN-2fa',{
      celular: celular,
      clave: clave
    });
  }

  //EL DUEÑO SE REGISTRA SOLO (DECISION DEL 04/11/2026). LOS VAQUEROS LOS CREA EL DUEÑO DESDE MI FINCA
  RegistrarDuenio(nombre: string, celular: string, clave: string):Observable <RespuestaServer>{
    return this.http.post<RespuestaServer>(this.url_ms_seguridad + 'registrar-duenio',{
      nombre: nombre,
      celular: celular,
      clave: clave
    });
  }

  //NOMBRE Y CORREO (OPCIONAL) DEL USUARIO AUTENTICADO. DEVUELVE EL PERFIL ACTUALIZADO EN DATOS
  ActualizarMiPerfil(nombre: string, correo: string | null):Observable <RespuestaServer>{
    return this.http.post<RespuestaServer>(this.url_ms_seguridad + 'actualizar-mi-perfil',{
      nombre: nombre,
      correo: correo
    }, { headers: this.getHeaders() });
  }

  //GUARDA EN LA SESION EL NOMBRE Y EL CORREO NUEVOS (DESPUES DE ActualizarMiPerfil)
  ActualizarUsuarioEnSesion(usuario: { nombre?: string; correo?: string | null }){
    const sesion = this.ObtenerDatosUsuarioIdentificadoSESION();
    if (!sesion?.usuario) {
      return;
    }
    sesion.usuario = { ...sesion.usuario, ...usuario };
    localStorage.setItem('datosSesion', JSON.stringify(sesion));
    this.ActualizarComportamientoUsuario(sesion);
  }

  //CAMBIA LA CLAVE DEL USUARIO AUTENTICADO
  CambiarClave(clave_actual: string, clave_nueva: string):Observable <RespuestaServerSinDATA>{
    return this.http.post<RespuestaServerSinDATA>(this.url_ms_seguridad + 'cambiar-clave',{
      clave_actual: clave_actual,
      clave_nueva: clave_nueva
    }, { headers: this.getHeaders() });
  }



  ObtenerDatosLocalStorage_TOKEN(): string | null{
    let datosLS = localStorage.getItem('datosSesion');
    if (datosLS) {
      let datos = JSON.parse(datosLS);
      const token = datos.token;
      return token;
    } else {
      return null;
    }
  }




  /**
   * metodo para almacenar los datos del usuario identificado en el localstorage
   * @param datosUsuario
   * @returns
   */
  AlmacenarDatosUsuarioIdentificadoSESION(datosUsuario: RespuestaServer):boolean {
    let cadena =JSON.stringify(datosUsuario.DATOS);
    let datosLS= localStorage.getItem('datosSesion');
    if (datosLS){
      //manda a /seguridad/cerrar-sesion para cerrar la sesion del usuario anterior y luego almacenar el nuevo usuario
      this.router.navigate(['/seguridad/cerrar-sesion']);

      return false;

    }else{
      localStorage.setItem('datosSesion', cadena);
      this.validacionDeSesion(); //actualiza el comportamiento del usuario es decir actualiza el observable "la barra de navegacion"
      return true;
    }
  }
  /**
   *  metodo para obtener los datos del usuario identificado en el sistema
   * @returns UsuarioValidadoModel | null
   */
  ObtenerDatosUsuarioIdentificadoSESION(): UsuarioValidadoModel | null{
    let datosLS = localStorage.getItem('datosSesion');
    if (datosLS) {
      return JSON.parse(datosLS);
    } else {
      return null;
    }
  }



  RemoverDatosUsuarioValidadoSesion() :Promise<void>{
    return new Promise((resolve) => {
    let datosLS = localStorage.getItem('datosSesion');
    if (datosLS) {
      let sesion=this.ObtenerDatosUsuarioIdentificadoSESION();
      this.CerrarSesion(sesion?.usuario?.id_usuario!,sesion?.token!).subscribe({
        next: () => {
          this.LimpiarSesionLocal();
          resolve();
        },
        error: () => {
          //SI EL BACKEND NO RESPONDE IGUAL SE CIERRA LA SESION EN ANGULAR
          this.LimpiarSesionLocal();
          resolve();
        }
      });
    } else {
      resolve();
    }
  } );
  }

  private LimpiarSesionLocal(){
    clearTimeout(this.temporizadorVencimiento);
    localStorage.removeItem('datosSesion');
    localStorage.removeItem('menuLateral');
    localStorage.removeItem('fincaActual');
    this.necesitaClave.next(false);
    this.ActualizarComportamientoUsuario(new UsuarioValidadoModel());
  }

  CerrarSesion(id_usuario: string ,token: string):Observable <RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url_ms_seguridad + 'cerrar-sesion',{
      id_usuario: id_usuario,
      token: token
    });
  }




  /**
   * Obtiene los datos de la sesion del usuario
   * @returns datos de la sesion del usuario
   */
  datosUsuarioValidado = new BehaviorSubject<UsuarioValidadoModel>(new UsuarioValidadoModel());

  ObtenerDatosSesion(): Observable<UsuarioValidadoModel> {
    return this.datosUsuarioValidado.asObservable();
  }

validacionDeSesion(): boolean{
  let datosLS = localStorage.getItem('datosSesion');
  if (datosLS) {
    //SIN SEÑAL SE SIGUE TRABAJANDO AUNQUE EL TOKEN HAYA VENCIDO (DECISION DEL 22/10/2026): LA SESION NO SE CIERRA
    //NI SE BORRA NADA DEL CELULAR; SOLO SE PIDE LA CLAVE CUANDO TOQUE SINCRONIZAR
    const vence = this.ObtenerVencimientoToken();
    if (vence !== null && vence <= Date.now()) {
      this.MarcarNecesitaClave();
    }
    let objUsuario= JSON.parse(datosLS);
    this.ActualizarComportamientoUsuario(objUsuario);
    this.ProgramarCierrePorVencimiento(vence);
    return true;
  } else {
    return false;
  }
}


//-------------------------------------TOKEN VENCIDO O INVALIDO: SE PIDE LA CLAVE (NO SE CIERRA LA SESION)-------------------------------------
//EN GANADERO EL CIERRE AUTOMATICO DE LA SESION (K.1) SE VUELVE "VUELVE A ESCRIBIR TU CLAVE": LO REGISTRADO SIN SEÑAL NO SE PIERDE
private temporizadorVencimiento: any = null;
private verificandoToken = false;
//true = EL TOKEN YA NO SIRVE: LA APP SIGUE FUNCIONANDO CON LO DEL CELULAR Y LA SINCRONIZACION ESPERA LA CLAVE
necesitaClave = new BehaviorSubject<boolean>(false);

//LEE LA FECHA DE VENCIMIENTO (exp) DEL TOKEN; EL TOKEN DURA 12 H DESDE QUE SE INICIA SESION
ObtenerVencimientoToken(): number | null {
  const token = this.ObtenerDatosLocalStorage_TOKEN();
  if (!token) {
    return null;
  }
  try {
    const carga = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return carga?.exp ? Number(carga.exp) * 1000 : null;
  } catch {
    return null;
  }
}

//DEJA PROGRAMADO EL CIERRE DE LA SESION PARA EL MOMENTO EXACTO EN QUE VENCE EL TOKEN
private ProgramarCierrePorVencimiento(vence: number | null){
  clearTimeout(this.temporizadorVencimiento);
  if (vence === null) {
    return;
  }
  if (vence <= Date.now()) {
    return;
  }
  //setTimeout NO ACEPTA MAS DE ~24 DIAS
  const faltan = Math.min(vence - Date.now(), 2147483647);
  this.temporizadorVencimiento = setTimeout(() => this.MarcarNecesitaClave(), faltan);
}

/**
 * PREGUNTA A ms-seguridad SI EL TOKEN SIGUE VIGENTE (FIRMA, VENCIMIENTO Y ESTADO EN LA TABLA LOGIN)
 * SE USA AL ABRIR LA APP Y CUANDO UNA PETICION RESPONDE 401: UN 401 TAMBIEN PUEDE SER FALTA DE PERMISO,
 * POR ESO SOLO SE CIERRA LA SESION SI ms-seguridad RECHAZA EL TOKEN (SI NO RESPONDE, NO SE HACE NADA)
 */
VerificarTokenEnServidor(){
  const token = this.ObtenerDatosLocalStorage_TOKEN();
  if (!token || this.verificandoToken) {
    return;
  }
  this.verificandoToken = true;
  this.http.post(this.url_ms_seguridad + 'consultar-rol', { token: token }).subscribe({
    next: () => {
      this.verificandoToken = false;
    },
    error: (err) => {
      this.verificandoToken = false;
      //SOLO SI EL TOKEN QUE SE VERIFICO ES EL QUE SIGUE GUARDADO (PUDO INICIAR SESION OTRA VEZ ENTRE TANTO)
      if (err?.status === 401 && this.ObtenerDatosLocalStorage_TOKEN() === token) {
        this.MarcarNecesitaClave();
      }
    }
  });
}

//EL TOKEN YA NO SIRVE: SE AVISA UNA VEZ Y LA BARRA DE ARRIBA PIDE LA CLAVE (NADA SE BORRA)
MarcarNecesitaClave(){
  if (!localStorage.getItem('datosSesion') || this.necesitaClave.value) {
    return;
  }
  this.necesitaClave.next(true);
  if (navigator.onLine) {
    this.toast.warning('Tu sesión venció. Escribe tu clave para seguir subiendo lo que registres.', 'Falta tu clave', 6000, true, true, true);
  }
}

//VUELVE A ENTRAR CON EL MISMO CELULAR SIN CERRAR LA SESION: REEMPLAZA EL TOKEN Y LOS PERMISOS. LA BANDEJA NO SE TOCA
Reingresar(clave: string): Observable<RespuestaServer> {
  const celular = this.ObtenerDatosUsuarioIdentificadoSESION()?.usuario?.celular ?? '';
  return new Observable<RespuestaServer>(observador => {
    this.IdentificarUsuario(celular, clave).subscribe({
      next: (respuesta) => {
        if (respuesta.CODIGO === 200 && respuesta.DATOS?.token) {
          localStorage.setItem('datosSesion', JSON.stringify(respuesta.DATOS));
          this.ConstruirMenuLateral(respuesta.DATOS.menu);
          this.necesitaClave.next(false);
          this.validacionDeSesion();
        }
        observador.next(respuesta);
        observador.complete();
      },
      error: (err) => observador.error(err)
    });
  });
}

validarAdmin(): boolean{
  return this.obtenerRolIdActual() === 1;
}

//PERMISO DEL ROL SOBRE UN MENU (LOS QUE LLEGARON AL INICIAR SESION). EJ: tienePermiso(8, 'guardar') = PUEDE CREAR PERSONAS
//SEGURIDAD VISUAL: LA REAL ES EL @authenticate DE CADA ENDPOINT
tienePermiso(menuid: number, accion: 'listar' | 'guardar' | 'editar' | 'eliminar' | 'buscar_id'): boolean {
  const sesion = this.ObtenerDatosUsuarioIdentificadoSESION();
  const permiso = sesion?.menu?.find(m => Number(m.menuid) === menuid);
  return !!permiso && permiso[accion] === true;
}

//ROLES DE SEGURIDAD: 1 ADMINISTRADOR, 2 DUEÑO, 3 VAQUERO, 4 VETERINARIO (EL ROL QUE MANDA EN CADA FINCA ES ROL_FINCA)
esDuenio(): boolean {
  return this.obtenerRolIdActual() === 2;
}


obtenerRolIdActual(): number | null {
  const datosLS = localStorage.getItem('datosSesion');
  if (!datosLS) {
    return null;
  }

  try {
    const objUsuario = JSON.parse(datosLS);
    const rol = Number(objUsuario?.usuario?.rolid);
    return Number.isNaN(rol) ? null : rol;
  } catch {
    return null;
  }
}



ActualizarComportamientoUsuario(datos:UsuarioValidadoModel){
  return this.datosUsuarioValidado.next(datos);
}


/**
 * metodo que se encarga de construir el menu lateral del sistema por roles
 * @param permisos
 * @returns
 */
ConstruirMenuLateral(permisos: PermisoModel[]){
  let menu: ItemMenuModel[] = [];
  permisos.forEach((permiso: PermisoModel) => {
    let datosRuta = ConfiguracionMenuLateral.listaMenus.filter(x => x.menuid ==permiso.menuid);
    //DOS MENUS PUEDEN LLEVAR A LA MISMA PANTALLA: SE MUESTRA UNA VEZ
    if (datosRuta.length > 0 && !menu.some(m => m.ruta === datosRuta[0].ruta)) {
      let item: ItemMenuModel = new ItemMenuModel();
      item.menuid = permiso.menuid;
      item.ruta = datosRuta[0].ruta;
      item.texto = datosRuta[0].texto;
      item.icono = datosRuta[0].icono;
      item.fase = datosRuta[0].fase;
      menu.push(item);
    }
  });
  this.AlmacenarItemMenuLateral(menu);
}

/**
 * metodo que se encarga de almacenar el menu lateral del sistema
 * @param menu
 */
AlmacenarItemMenuLateral(menu: ItemMenuModel[]){
  let cadena =JSON.stringify(menu);
  localStorage.setItem('menuLateral', cadena);
}

/**
 * metodo que se encarga de obtener el menu lateral del sistema
 * @returns ItemMenuModel[]
 */
ObtenerItemMenuLateral(): ItemMenuModel[]{
  let menu : ItemMenuModel[] = [];
  let datosLS = localStorage.getItem('menuLateral');
  if (datosLS) {
    menu = JSON.parse(datosLS);
  }
  return menu;
}


}
