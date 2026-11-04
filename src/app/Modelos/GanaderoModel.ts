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

//SINCRONIZACION ---------------------------------------------------------------------------------------------------------------------
export type TipoRegistro = 'LOTE' | 'ANIMAL' | 'PESAJE' | 'VACUNACION' | 'SERVICIO' | 'PALPACION' | 'PARTO' | 'ORDENO' | 'SALIDA';
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
