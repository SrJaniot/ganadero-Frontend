import { RespuestaServer } from './RespuestaServer.model';

//DTOS DE GANADERO TAL COMO LOS DEVUELVE LA BASE (MAYUSCULAS). EL CELULAR LOS GUARDA ASI EN DEXIE PARA NO TRADUCIR DOS VECES
//LAS PANTALLAS LOS MAPEAN A VIEWMODELS EN camelCase CUANDO HACE FALTA

export type RolFinca = 'DUENIO' | 'VAQUERO' | 'VETERINARIO';

//NOMBRE DE CADA ROL DE LA FINCA EN PANTALLA
export const NOMBRE_ROL_FINCA: Record<string, string> = {
  DUENIO: 'Dueño',
  VAQUERO: 'Vaquero',
  VETERINARIO: 'Veterinario',
};

//FINCA ------------------------------------------------------------------------------------------------------------------------------
export interface MiFincaDTO {
  ID_FINCA: number;
  NOM_FINCA: string;
  MUNICIPIO_FINCA: string;
  VEREDA_FINCA: string | null;
  ROL_FINCA: RolFinca;
  ANIMALES_ACTIVOS: number;
}

export interface FincaDTO {
  ID_FINCA: number;
  NOM_FINCA: string;
  MUNICIPIO_FINCA: string;
  VEREDA_FINCA: string | null;
  REGISTRO_ICA_FINCA: string | null;
  HIERRO_FINCA: string | null;
  ROL_FINCA?: RolFinca;
}

export interface PersonaFincaDTO {
  ID_FINCA_PERSONA: number;
  ID_USUARIO: string;
  NOM_PERSONA: string;
  ROL_FINCA: RolFinca;
  ESTADO_FINCA_PERSONA: 'ACTIVO' | 'INACTIVO';
}

//LA FINCA EN LA QUE SE ESTA TRABAJANDO (localStorage 'fincaActual')
export interface FincaActual {
  idFinca: number;
  nombre: string;
  rol: RolFinca;
}

//CATALOGOS --------------------------------------------------------------------------------------------------------------------------
export interface RazaDTO {
  ID_RAZA: number;
  NOM_RAZA: string;
  ESTADO_RAZA?: string;
}

export interface VacunaDTO {
  ID_VACUNA: number;
  NOM_VACUNA: string;
  TIPO_VACUNA: string;
  DIAS_REFUERZO: number | null;
  DIAS_RETIRO_LECHE: number;
  OBLIGATORIA_ICA: 'SI' | 'NO';
  ESTADO_VACUNA: string;
}

//HATO -------------------------------------------------------------------------------------------------------------------------------
export interface LoteDTO {
  ID_LOTE?: number;
  UUID_LOTE: string;
  NOM_LOTE: string;
  ESTADO_LOTE: 'ACTIVO' | 'ANULADO';
}

export interface AnimalDTO {
  ID_ANIMAL?: number;                 //NO EXISTE MIENTRAS EL ANIMAL NO SE HA SUBIDO
  UUID_ANIMAL: string;
  UUID_LOTE: string | null;
  NOM_LOTE?: string | null;
  ID_RAZA: number | null;
  NOM_RAZA?: string | null;
  CHAPETA_ANIMAL: string | null;
  NOM_ANIMAL: string | null;
  SEXO_ANIMAL: 'H' | 'M';
  CATEGORIA_ANIMAL?: string | null;   //LA CALCULA LA BASE; EN EL CELULAR SE CALCULA CON categoriaAnimal() MIENTRAS TANTO
  FECHA_NACIMIENTO: string;           //AAAA-MM-DD
  FECHA_NACIMIENTO_ESTIMADA: 'SI' | 'NO';
  UUID_MADRE: string | null;
  CHAPETA_MADRE?: string | null;
  UUID_PADRE: string | null;
  CHAPETA_PADRE?: string | null;
  PADRE_EXTERNO: string | null;
  ORIGEN_ANIMAL: 'NACIDO' | 'COMPRADO';
  FECHA_INGRESO_ANIMAL: string;
  FOTO_ANIMAL?: string | null;
  PESO_ACTUAL_KG: number | string | null;
  FECHA_ULTIMO_PESAJE: string | null;
  FECHA_SALIDA_ANIMAL?: string | null;
  ESTADO_ANIMAL: 'ACTIVO' | 'VENDIDO' | 'MUERTO' | 'TRASLADADO' | 'ANULADO';
  FECHA_MODIFICACION?: string;
  _pendiente?: boolean;               //SOLO EN EL CELULAR: AUN NO LLEGA AL SERVIDOR
}

export interface PesajeDTO {
  UUID_PESAJE: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;               //AAAA-MM-DDTHH:mm (HORA LOCAL DEL POTRERO)
  PESO_KG: number | string | null;    //CON CINTA Y SIN PESO LO CALCULA LA BASE AL SUBIR
  ESTIMADO_CINTA: 'SI' | 'NO';
  PERIMETRO_CM: number | string | null;
  OBSERVACION_PESAJE: string | null;
  ESTADO_PESAJE: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

//EVENTOS DE LA FASE 2 (MISMAS COLUMNAS QUE BAJAN EN FUN_OBTENER_CAMBIOS_JSON) ---------------------------------------------------------
export interface VacunacionDTO {
  UUID_VACUNACION: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;
  ID_VACUNA: number;
  DOSIS_VACUNACION: string | null;
  FECHA_PROXIMA_DOSIS: string | null;   //AAAA-MM-DD (EN EL CELULAR SE CALCULA CON EL CATALOGO; LA BASE GUARDA LA OFICIAL)
  FECHA_FIN_RETIRO: string | null;      //NO VENDER LA LECHE HASTA ESTE DIA
  OBSERVACION_VACUNACION: string | null;
  ESTADO_VACUNACION: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

export interface ServicioDTO {
  UUID_SERVICIO: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;
  TIPO_SERVICIO: 'MONTA' | 'INSEMINACION';
  UUID_TORO: string | null;
  TORO_EXTERNO: string | null;
  OBSERVACION_SERVICIO: string | null;
  ESTADO_SERVICIO: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

export interface PalpacionDTO {
  UUID_PALPACION: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;
  RESULTADO_PALPACION: 'PRENIADA' | 'VACIA';
  MESES_GESTACION: number | null;
  OBSERVACION_PALPACION: string | null;
  ESTADO_PALPACION: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

export interface PartoDTO {
  UUID_PARTO: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;
  TIPO_PARTO: 'NORMAL' | 'ASISTIDO' | 'CESAREA' | 'ABORTO';
  CRIA_VIVA: 'SI' | 'NO';
  SEXO_CRIA: 'H' | 'M' | null;
  UUID_CRIA: string | null;
  OBSERVACION_PARTO: string | null;
  ESTADO_PARTO: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

export interface OrdenoDTO {
  UUID_ORDENO: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;
  JORNADA_ORDENO: 'MANANA' | 'TARDE';
  LITROS_ORDENO: number | string;
  OBSERVACION_ORDENO: string | null;
  ESTADO_ORDENO: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

export interface SalidaDTO {
  UUID_SALIDA: string;
  UUID_ANIMAL: string;
  FECHA_EVENTO: string;
  TIPO_SALIDA: 'VENTA' | 'MUERTE' | 'TRASLADO';
  VALOR_SALIDA: number | string | null;
  PESO_SALIDA_KG: number | string | null;
  CAUSA_SALIDA: string | null;
  OBSERVACION_SALIDA: string | null;
  ESTADO_SALIDA: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

//POTREROS Y ROTACION (FASE 5A) -----------------------------------------------------------------------------------------------------
export interface PotreroDTO {
  UUID_POTRERO: string;
  NOM_POTRERO: string;
  AREA_POTRERO: number | string | null;      //HECTAREAS
  DIAS_DESCANSO_POTRERO: number;
  CONTORNO_POTRERO: [number, number][] | null; //[LATITUD, LONGITUD] DIBUJADOS EN EL MAPA (OPCIONAL)
  ESTADO_POTRERO: 'ACTIVO' | 'ANULADO';
  _pendiente?: boolean;
}

//UN LOTE QUE ENTRO A UN POTRERO (FECHA_EVENTO) Y, SI YA SALIO, CUANDO (FECHA_SALIDA_OCUPACION)
export interface OcupacionDTO {
  UUID_OCUPACION: string;
  UUID_POTRERO: string;
  UUID_LOTE: string;
  FECHA_EVENTO: string;
  FECHA_SALIDA_OCUPACION: string | null;
  OBSERVACION_OCUPACION: string | null;
  ESTADO_OCUPACION: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

//PLATA (FASE 5B, SOLO EL DUEÑO) ----------------------------------------------------------------------------------------------------
export type TipoMovimiento = 'INGRESO' | 'GASTO';
export type CategoriaMovimiento = 'VENTA_LECHE' | 'OTRO_INGRESO' | 'COMPRA_ANIMAL' | 'DROGAS' | 'SAL_CONCENTRADO' | 'JORNALES' | 'OTRO_GASTO';
export interface MovimientoDTO {
  UUID_MOVIMIENTO: string;
  FECHA_EVENTO: string;
  TIPO_MOVIMIENTO: TipoMovimiento;
  CATEGORIA_MOVIMIENTO: CategoriaMovimiento;
  VALOR_MOVIMIENTO: number | string;
  LITROS_MOVIMIENTO: number | string | null;
  DESCRIPCION_MOVIMIENTO: string | null;
  ESTADO_MOVIMIENTO: 'ACTIVO' | 'ANULADO';
  USUARIO_CREACION?: string;
  _pendiente?: boolean;
}

//EL RESUMEN QUE CALCULA FUN_OBTENER_PLATA_JSON (CATEGORIA VENTA_ANIMAL = LAS SALIDAS VENDIDAS CON VALOR)
export interface PlataDTO {
  DESDE: string;
  HASTA: string;
  INGRESOS: number;
  GASTOS: number;
  SALDO: number;
  POR_CATEGORIA: { TIPO: TipoMovimiento; CATEGORIA: CategoriaMovimiento | 'VENTA_ANIMAL'; VALOR: number; CANTIDAD: number }[];
  POR_MES: { MES: string; INGRESOS: number; GASTOS: number; SALDO: number }[];
  LECHE: { LITROS: number | null; VALOR: number; PRECIO_LITRO: number | null };
}
export interface PlataGuardada { plata: PlataDTO; recibida: string; periodo: string; }
export interface RespuestaServerPlata extends RespuestaServer { DATOS?: PlataDTO }

//TODO LO QUE LE HA PASADO A UN ANIMAL EN EL CELULAR (LA FICHA ARMA CON ESTO SU LINEA DE TIEMPO, SIN SEÑAL)
export interface EventosAnimal {
  pesajes: PesajeDTO[];
  vacunaciones: VacunacionDTO[];
  servicios: ServicioDTO[];
  palpaciones: PalpacionDTO[];
  partos: PartoDTO[];
  ordenos: OrdenoDTO[];
  salidas: SalidaDTO[];
}

//ALERTAS DE LA FASE 3 (FUN_OBTENER_ALERTAS_JSON). EL CELULAR GUARDA LA ULTIMA RESPUESTA PARA VERLA SIN SEÑAL --------------------------
export interface AnimalAlerta { UUID_ANIMAL: string; CHAPETA_ANIMAL: string | null; NOM_ANIMAL: string | null; }
export interface AlertasDTO {
  FECHA: string;                       //EL DIA PARA EL QUE SE CALCULARON (AAAA-MM-DD)
  PARTOS_PROXIMOS: (AnimalAlerta & { FECHA_PARTO_PROBABLE: string; DIAS: number; SEGUN: 'SERVICIO' | 'PALPACION'; PADRE: string | null })[];
  PALPAR: (AnimalAlerta & { FECHA_SERVICIO: string; DIAS_DESDE_SERVICIO: number })[];
  VACIAS: (AnimalAlerta & { FECHA_ULTIMO_PARTO: string; DIAS_VACIA: number })[];
  VACUNAS_POR_APLICAR: (AnimalAlerta & { ID_VACUNA: number; NOM_VACUNA: string; FECHA_PROXIMA_DOSIS: string; DIAS: number })[];
  RETIROS_LECHE: (AnimalAlerta & { NOM_VACUNA: string; FECHA_FIN_RETIRO: string; DIAS_RESTANTES: number })[];
  CICLOS_ICA: { ID_CICLO: number; NOM_CICLO: string; NOM_VACUNA: string; FECHA_INICIO_CICLO: string; FECHA_FIN_CICLO: string; VIGENTE: boolean; DIAS_PARA_EMPEZAR: number; DIAS_PARA_TERMINAR: number; FALTAN: number }[];
  DIAS_VACIA_ALERTA: number;
  DIAS_AVISO_PARTO: number;
}
//LO QUE SE GUARDA EN EL CELULAR: LAS ALERTAS Y CUANDO SE PIDIERON (ISO)
export interface AlertasGuardadas { alertas: AlertasDTO; recibidas: string; }
export interface RespuestaServerAlertas extends RespuestaServer { DATOS?: AlertasDTO }

//SINCRONIZACION ---------------------------------------------------------------------------------------------------------------------
export type TipoRegistro = 'LOTE' | 'ANIMAL' | 'PESAJE' | 'VACUNACION' | 'SERVICIO' | 'PALPACION' | 'PARTO' | 'ORDENO' | 'SALIDA' | 'POTRERO' | 'OCUPACION' | 'MOVIMIENTO';
export type OperacionRegistro = 'CREAR' | 'EDITAR' | 'ANULAR';

//UN REGISTRO DE LA BANDEJA DE SALIDA (PLAN_GANADERO.md, SECCION 4.1). orden LO PONE DEXIE (AUTOINCREMENTAL)
export interface RegistroBandeja {
  orden?: number;
  uuid: string;
  tipo: TipoRegistro;
  operacion: OperacionRegistro;
  datos: any;
  fechaCreacion: string;              //ISO: CUANDO SE REGISTRO EN EL CELULAR
  estado: 'PENDIENTE' | 'RECHAZADO';
  mensaje?: string | null;            //POR QUE LO RECHAZO EL SERVIDOR
  descripcion: string;                //TEXTO PARA LA PANTALLA: "Pesaje de la vaca 23: 412 kg"
}

export interface ResultadoRegistro {
  UUID: string;
  ORDEN?: number;
  ESTADO: 'OK' | 'YA_EXISTIA' | 'RECHAZADO';
  MENSAJE?: string | null;
}

export interface CambiosDTO {
  MARCA: string;
  COMPLETO: boolean;
  ROL_FINCA: RolFinca;
  FINCA: FincaDTO | null;
  PERSONAS: { ID_USUARIO: string; NOM_PERSONA: string; ROL_FINCA: RolFinca; ESTADO_FINCA_PERSONA: string }[];
  LOTES: LoteDTO[];
  ANIMALES: AnimalDTO[];
  PESAJES: PesajeDTO[];
  VACUNACIONES: any[];
  SERVICIOS: any[];
  PALPACIONES: any[];
  PARTOS: any[];
  ORDENOS: any[];
  SALIDAS: any[];
  POTREROS?: PotreroDTO[];
  OCUPACIONES?: OcupacionDTO[];
  MOVIMIENTOS?: MovimientoDTO[];
  RAZAS: RazaDTO[];
  VACUNAS: VacunaDTO[];
  CICLOS_ICA: any[];
}

export interface SincronizacionDTO {
  ID_SINCRONIZACION: number;
  NOM_PERSONA: string | null;
  FECHA_SINCRONIZACION: string;
  RECIBIDOS_SINCRONIZACION: number;
  GUARDADOS_SINCRONIZACION: number;
  OMITIDOS_SINCRONIZACION: number;
  RECHAZADOS_SINCRONIZACION: number;
  DETALLE_SINCRONIZACION: { UUID: string; TIPO: string; OPERACION: string; MENSAJE: string }[] | null;
}

export interface EventoLineaTiempoDTO {
  TIPO_EVENTO: string;
  UUID_EVENTO: string;
  FECHA_EVENTO: string;
  DESCRIPCION_EVENTO: string;
  OBSERVACION_EVENTO: string | null;
  USUARIO_CREACION: string;
}

//RESPUESTAS TIPADAS ------------------------------------------------------------------------------------------------------------------
export interface RespuestaServerObtenerMisFincas extends RespuestaServer { DATOS?: MiFincaDTO[] }
export interface RespuestaServerObtenerFinca extends RespuestaServer { DATOS?: FincaDTO }
export interface RespuestaServerObtenerPersonasFinca extends RespuestaServer { DATOS?: PersonaFincaDTO[] }
export interface RespuestaServerCrearFinca extends RespuestaServer { DATOS?: { ID_FINCA: number } }
export interface RespuestaServerCrearPersonaFinca extends RespuestaServer { DATOS?: { ID_FINCA_PERSONA: number; ID_USUARIO: string; CUENTA_NUEVA: boolean } }
export interface RespuestaServerSincronizar extends RespuestaServer { DATOS?: ResultadoRegistro[] }
export interface RespuestaServerCambios extends RespuestaServer { DATOS?: CambiosDTO }
export interface RespuestaServerObtenerSincronizaciones extends RespuestaServer { DATOS?: SincronizacionDTO[] }
export interface RespuestaServerLineaTiempo extends RespuestaServer { DATOS?: EventoLineaTiempoDTO[] }

//INDICADORES (FASE 4, MENU 6): LOS CALCULA FUN_OBTENER_INDICADORES_JSON; EL CELULAR GUARDA LA ULTIMA RESPUESTA (meta 'INDICADORES')
export interface IndicadoresDTO {
  DESDE: string;
  HASTA: string;
  ANIMALES_EN_EL_PERIODO: number;
  HATO_POR_CATEGORIA: { CATEGORIA: string; CANTIDAD: number }[];
  NATALIDAD: { CRIAS_VIVAS: number; HEMBRAS: number; PORCENTAJE: number | null };
  MORTALIDAD: { MUERTES: number; ANIMALES: number; PORCENTAJE: number | null };
  INTERVALO_PARTOS: { PROMEDIO_DIAS: number | null; INTERVALOS: number };
  LECHE: { LITROS_TOTALES: number; DIAS_CON_ORDENO: number; LITROS_VACA_DIA: number | null; POR_MES: { MES: string; LITROS: number; LITROS_VACA_DIA: number | null }[] };
  PARTOS_POR_MES: { MES: string; PARTOS: number; CRIAS_VIVAS: number }[];
  GANANCIA_PESO: { GRAMOS_DIA: number | null; ANIMALES: number; POR_LOTE: { NOM_LOTE: string; ANIMALES: number; GRAMOS_DIA: number | null }[] };
  VENTAS: { CANTIDAD: number; VALOR_TOTAL: number };
}
export interface IndicadoresGuardados { indicadores: IndicadoresDTO; recibidas: string; periodo: string; }
export interface RespuestaServerIndicadores extends RespuestaServer { DATOS?: IndicadoresDTO }
