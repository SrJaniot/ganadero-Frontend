import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { CategoriaMovimiento, MovimientoDTO, PlataGuardada, RespuestaServerPlata, TipoMovimiento } from '../Modelos/GanaderoModel';
import { formatearPesos } from '../compartido/pesos.pipe';
import { AlmacenLocalService } from './almacen-local';
import { SeguridadService } from './seguridad';
import { SincronizacionService } from './sincronizacion.service';

//COMO SE NOMBRA CADA CATEGORIA EN LA PANTALLA (VENTA_ANIMAL NO SE ANOTA: SALE DE LAS SALIDAS)
export const NOMBRE_CATEGORIA: Record<CategoriaMovimiento | 'VENTA_ANIMAL', string> = {
  VENTA_LECHE: 'Venta de leche',
  OTRO_INGRESO: 'Otro ingreso',
  VENTA_ANIMAL: 'Venta de animales',
  COMPRA_ANIMAL: 'Compra de animales',
  DROGAS: 'Drogas y veterinario',
  SAL_CONCENTRADO: 'Sal y concentrado',
  JORNALES: 'Jornales',
  OTRO_GASTO: 'Otro gasto',
};

export const CATEGORIAS_POR_TIPO: Record<TipoMovimiento, CategoriaMovimiento[]> = {
  INGRESO: ['VENTA_LECHE', 'OTRO_INGRESO'],
  GASTO: ['DROGAS', 'SAL_CONCENTRADO', 'JORNALES', 'COMPRA_ANIMAL', 'OTRO_GASTO'],
};

//DATOS DE UN MOVIMIENTO NUEVO (snake_case: VAN TAL CUAL EN "datos" DE LA BANDEJA, COMO LOS ESPERA LA BASE)
export interface DatosMovimiento {
  tipo_movimiento: TipoMovimiento;
  categoria_movimiento: CategoriaMovimiento;
  valor_movimiento: number;
  litros_movimiento: number | null;
  descripcion_movimiento: string | null;
  fecha_evento: string;
}

//PLATA DE LA FINCA (FASE 5B, SOLO EL DUEÑO). LOS MOVIMIENTOS SE ANOTAN SIN SEÑAL (BANDEJA, TIPO MOVIMIENTO);
//EL RESUMEN LO CALCULA LA BASE (FUN_OBTENER_PLATA_JSON) Y EL CELULAR GUARDA LA ULTIMA CONSULTA (meta 'PLATA')
@Injectable({
  providedIn: 'root'
})
export class PlataService {
  private url = ConfiguracionRutasBackend.url_backend_ms_negocio;

  constructor(
    private http: HttpClient,
    private almacenLocal: AlmacenLocalService,
    private sincronizacion: SincronizacionService,
    private seguridadService: SeguridadService,
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.seguridadService.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  //desde Y hasta EN AAAA-MM-DD; SIN ELLOS LA BASE TOMA ESTE MES
  ObtenerPlata(id_finca: number, desde: string | null, hasta: string | null): Observable<RespuestaServerPlata> {
    return this.http.post<RespuestaServerPlata>(this.url + 'ObtenerPlata', { id_finca, desde, hasta }, { headers: this.getHeaders() });
  }

  guardarResumen(guardada: PlataGuardada): Promise<unknown> {
    return this.almacenLocal.guardarMeta('PLATA', guardada);
  }

  leerResumen(): Promise<PlataGuardada | null> {
    return this.almacenLocal.leerMeta<PlataGuardada>('PLATA');
  }

  async anotar(d: DatosMovimiento): Promise<string> {
    const uuid = crypto.randomUUID();
    const fila: MovimientoDTO = {
      UUID_MOVIMIENTO: uuid, FECHA_EVENTO: d.fecha_evento, TIPO_MOVIMIENTO: d.tipo_movimiento, CATEGORIA_MOVIMIENTO: d.categoria_movimiento,
      VALOR_MOVIMIENTO: d.valor_movimiento, LITROS_MOVIMIENTO: d.litros_movimiento, DESCRIPCION_MOVIMIENTO: d.descripcion_movimiento, ESTADO_MOVIMIENTO: 'ACTIVO',
    };
    await this.almacenLocal.guardarConBandeja('MOVIMIENTO', fila, {
      uuid, operacion: 'CREAR', datos: d,
      descripcion: `${d.tipo_movimiento === 'INGRESO' ? 'Ingreso' : 'Gasto'}: ${NOMBRE_CATEGORIA[d.categoria_movimiento]} por ${formatearPesos(d.valor_movimiento)}`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  async anular(m: MovimientoDTO): Promise<void> {
    await this.almacenLocal.cambiarConBandeja('MOVIMIENTO', m.UUID_MOVIMIENTO, { ESTADO_MOVIMIENTO: 'ANULADO' }, {
      operacion: 'ANULAR', datos: {}, descripcion: `Anular: ${NOMBRE_CATEGORIA[m.CATEGORIA_MOVIMIENTO]} por ${formatearPesos(m.VALOR_MOVIMIENTO)}`,
    });
    this.sincronizacion.programar();
  }
}
