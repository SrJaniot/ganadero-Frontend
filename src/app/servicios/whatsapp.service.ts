import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { RespuestaServer } from '../Modelos/RespuestaServer.model';
import { RespuestaServerConectarWhatsapp, RespuestaServerEstadoWhatsapp, RespuestaServerResumenWhatsapp } from '../Modelos/GanaderoModel';
import { SeguridadService } from './seguridad';

//RESUMEN DIARIO POR WHATSAPP (FASE 5D). TODO NECESITA SEÑAL: LO MANDA EL SERVIDOR
//ADMINISTRADOR (MENU 7): ESTADO, QR, DESCONECTAR, CONFIGURACION Y "MANDAR YA". DUEÑO (MENU 2): SU RESUMEN EN CADA FINCA
@Injectable({
  providedIn: 'root'
})
export class WhatsappService {
  private url = ConfiguracionRutasBackend.url_backend_ms_negocio;

  constructor(
    private http: HttpClient,
    private seguridadService: SeguridadService,
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.seguridadService.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  //---------------------------------------------ADMINISTRADOR--------------------------------------------------------------------
  ObtenerEstadoWhatsapp(): Observable<RespuestaServerEstadoWhatsapp> {
    return this.http.get<RespuestaServerEstadoWhatsapp>(this.url + 'ObtenerEstadoWhatsapp', { headers: this.getHeaders() });
  }

  ConectarWhatsapp(): Observable<RespuestaServerConectarWhatsapp> {
    return this.http.post<RespuestaServerConectarWhatsapp>(this.url + 'ConectarWhatsapp', {}, { headers: this.getHeaders() });
  }

  DesconectarWhatsapp(): Observable<RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url + 'DesconectarWhatsapp', {}, { headers: this.getHeaders() });
  }

  GuardarConfigWhatsapp(instancia: string, hora: string, activo: 'SI' | 'NO'): Observable<RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url + 'GuardarConfigWhatsapp', { instancia, hora, activo }, { headers: this.getHeaders() });
  }

  EnviarResumenesWhatsapp(): Observable<RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url + 'EnviarResumenesWhatsapp', {}, { headers: this.getHeaders() });
  }

  //---------------------------------------------DUEÑO----------------------------------------------------------------------------
  ObtenerResumenWhatsapp(id_finca: number): Observable<RespuestaServerResumenWhatsapp> {
    return this.http.get<RespuestaServerResumenWhatsapp>(this.url + 'ObtenerResumenWhatsapp/' + id_finca, { headers: this.getHeaders() });
  }

  CambiarResumenWhatsapp(id_finca: number, activo: 'SI' | 'NO'): Observable<RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url + 'CambiarResumenWhatsapp', { id_finca, activo }, { headers: this.getHeaders() });
  }

  ProbarResumenWhatsapp(id_finca: number): Observable<RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url + 'ProbarResumenWhatsapp', { id_finca }, { headers: this.getHeaders() });
  }
}
