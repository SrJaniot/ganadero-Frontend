import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { IndicadoresGuardados, RespuestaServerIndicadores } from '../Modelos/GanaderoModel';
import { AlmacenLocalService } from './almacen-local';
import { SeguridadService } from './seguridad';

//INDICADORES DE LA FINCA (FASE 4, MENU 6). LOS CALCULA LA BASE (FUN_OBTENER_INDICADORES_JSON) CON LO QUE YA SUBIO;
//LA ULTIMA RESPUESTA SE GUARDA EN EL CELULAR (meta 'INDICADORES') PARA VERLA SIN SEÑAL, CON SU FECHA A LA VISTA
@Injectable({
  providedIn: 'root'
})
export class IndicadoresService {
  private url = ConfiguracionRutasBackend.url_backend_ms_negocio;

  constructor(
    private http: HttpClient,
    private almacenLocal: AlmacenLocalService,
    private seguridadService: SeguridadService,
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.seguridadService.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  //desde Y hasta EN AAAA-MM-DD; SIN ELLOS LA BASE TOMA LOS ULTIMOS 12 MESES
  ObtenerIndicadores(id_finca: number, desde: string | null, hasta: string | null): Observable<RespuestaServerIndicadores> {
    return this.http.post<RespuestaServerIndicadores>(this.url + 'ObtenerIndicadores', { id_finca, desde, hasta }, { headers: this.getHeaders() });
  }

  guardar(guardados: IndicadoresGuardados): Promise<unknown> {
    return this.almacenLocal.guardarMeta('INDICADORES', guardados);
  }

  leerGuardados(): Promise<IndicadoresGuardados | null> {
    return this.almacenLocal.leerMeta<IndicadoresGuardados>('INDICADORES');
  }
}
