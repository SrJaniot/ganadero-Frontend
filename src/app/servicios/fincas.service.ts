import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { SeguridadService } from './seguridad';
import { RespuestaServerSinDATA } from '../Modelos/RespuestaServerSinDATA.model';
import {
  RespuestaServerCrearFinca, RespuestaServerCrearPersonaFinca, RespuestaServerObtenerFinca,
  RespuestaServerObtenerMisFincas, RespuestaServerObtenerPersonasFinca, RolFinca
} from '../Modelos/GanaderoModel';

//FINCAS Y PERSONAS DE LA FINCA (ms-logica, MENU 2 MI FINCA Y 3 HATO). NECESITAN SEÑAL: NO PASAN POR LA BANDEJA
@Injectable({
  providedIn: 'root'
})
export class FincasService {
  private url = ConfiguracionRutasBackend.url_backend_ms_negocio;

  constructor(private http: HttpClient, private seguridadService: SeguridadService) { }

  private getHeaders(): HttpHeaders {
    const token = this.seguridadService.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  ObtenerMisFincas(): Observable<RespuestaServerObtenerMisFincas> {
    return this.http.get<RespuestaServerObtenerMisFincas>(this.url + 'ObtenerMisFincas', { headers: this.getHeaders() });
  }

  ObtenerFincaID(id_finca: number): Observable<RespuestaServerObtenerFinca> {
    return this.http.get<RespuestaServerObtenerFinca>(this.url + 'ObtenerFincaID/' + id_finca, { headers: this.getHeaders() });
  }

  CrearFinca(datos: { nom_finca: string; municipio_finca: string; vereda_finca: string | null; registro_ica_finca: string | null; hierro_finca: string | null }): Observable<RespuestaServerCrearFinca> {
    return this.http.post<RespuestaServerCrearFinca>(this.url + 'CrearFinca', datos, { headers: this.getHeaders() });
  }

  ActualizarFinca(datos: { id_finca: number; nom_finca: string; municipio_finca: string; vereda_finca: string | null; registro_ica_finca: string | null; hierro_finca: string | null }): Observable<RespuestaServerSinDATA> {
    return this.http.post<RespuestaServerSinDATA>(this.url + 'ActualizarFinca', datos, { headers: this.getHeaders() });
  }

  ObtenerPersonasFinca(id_finca: number): Observable<RespuestaServerObtenerPersonasFinca> {
    return this.http.get<RespuestaServerObtenerPersonasFinca>(this.url + 'ObtenerPersonasFinca/' + id_finca, { headers: this.getHeaders() });
  }

  //SI EL CELULAR YA TIENE CUENTA (TRABAJA EN OTRA FINCA) SE USA ESA Y LA CLAVE NO SE CAMBIA (DATOS.CUENTA_NUEVA = false)
  CrearPersonaFinca(datos: { id_finca: number; nom_persona: string; celular: string; clave: string | null; rol_finca: RolFinca }): Observable<RespuestaServerCrearPersonaFinca> {
    return this.http.post<RespuestaServerCrearPersonaFinca>(this.url + 'CrearPersonaFinca', datos, { headers: this.getHeaders() });
  }

  ActualizarPersonaFinca(datos: { id_finca_persona: number; rol_finca: RolFinca; estado_finca_persona: 'ACTIVO' | 'INACTIVO' }): Observable<RespuestaServerSinDATA> {
    return this.http.post<RespuestaServerSinDATA>(this.url + 'ActualizarPersonaFinca', datos, { headers: this.getHeaders() });
  }

  RestablecerClavePersonaFinca(datos: { id_finca: number; id_usuario: string; clave: string }): Observable<RespuestaServerSinDATA> {
    return this.http.post<RespuestaServerSinDATA>(this.url + 'RestablecerClavePersonaFinca', datos, { headers: this.getHeaders() });
  }
}
