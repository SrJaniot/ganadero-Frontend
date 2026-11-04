import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AnimalDTO, OrdenoDTO, PalpacionDTO, PartoDTO, SalidaDTO, ServicioDTO, TipoRegistro, VacunacionDTO } from '../Modelos/GanaderoModel';
import { AlmacenLocalService } from './almacen-local';
import { etiquetaAnimal } from './hato.service';
import { SincronizacionService } from './sincronizacion.service';

//DATOS DE CADA EVENTO (snake_case: VAN TAL CUAL EN "datos" DE LA BANDEJA, CON LAS CLAVES QUE LEE FUN_SINCRONIZAR_REGISTROS_JSON)
export interface DatosOrdeno { uuid_animal: string; jornada_ordeno: 'MANANA' | 'TARDE'; litros_ordeno: number; fecha_evento: string; observacion: string | null; }
export interface DatosVacunacion { uuid_animal: string; id_vacuna: number; dosis_vacunacion: string | null; fecha_evento: string; observacion: string | null; }
export interface DatosServicio { uuid_animal: string; tipo_servicio: 'MONTA' | 'INSEMINACION'; uuid_toro: string | null; toro_externo: string | null; fecha_evento: string; observacion: string | null; }
export interface DatosPalpacion { uuid_animal: string; resultado_palpacion: 'PRENIADA' | 'VACIA'; meses_gestacion: number | null; fecha_evento: string; observacion: string | null; }
export interface DatosParto {
  uuid_animal: string; tipo_parto: 'NORMAL' | 'ASISTIDO' | 'CESAREA' | 'ABORTO'; cria_viva: 'SI' | 'NO';
  sexo_cria: 'H' | 'M' | null; chapeta_cria: string | null; nom_cria: string | null; peso_cria_kg: number | null;
  fecha_evento: string; observacion: string | null;
}
export interface DatosSalida { uuid_animal: string; tipo_salida: 'VENTA' | 'MUERTE' | 'TRASLADO'; valor_salida: number | null; peso_salida_kg: number | null; causa_salida: string | null; fecha_evento: string; observacion: string | null; }

//DIAS DE GESTACION PARA EL PARTO PROBABLE (EL MISMO VALOR DE FABRICA DE TAB_CONFIGURACION: DIAS_GESTACION)
export const DIAS_GESTACION = 283;
//DIAS MINIMOS ENTRE DOS PARTOS (TAB_CONFIGURACION: DIAS_MINIMOS_ENTRE_PARTOS)
export const DIAS_MINIMOS_ENTRE_PARTOS = 240;

//SUMA DIAS A UNA FECHA AAAA-MM-DD (SIN HORA, PARA QUE NO SE CORRA UN DIA POR LA ZONA HORARIA)
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

// LOS EVENTOS DE LA LINEA DE TIEMPO (FASE 2): ORDEÑO, VACUNA O TRATAMIENTO, SERVICIO, PALPACION, PARTO Y SALIDA, MAS ANULAR CUALQUIERA
// TODO SE REGISTRA SIN SEÑAL: LA FILA VA A DEXIE Y EL REGISTRO A LA BANDEJA. LA BASE VUELVE A REVISAR LAS REGLAS AL SUBIR
// LO QUE EN EL SERVIDOR HACEN LOS TRIGGERS (ESTADO DEL ANIMAL POR LA SALIDA, PESO ACTUAL) AQUI SE HACE EN LA FICHA LOCAL PARA VERLO YA;
// AL SINCRONIZAR, LA BAJADA TRAE LA FICHA OFICIAL Y REEMPLAZA LA LOCAL
@Injectable({
  providedIn: 'root'
})
export class EventosService {

  constructor(
    private almacenLocal: AlmacenLocalService,
    private sincronizacion: SincronizacionService,
  ) { }

  private async etiqueta(uuid: string): Promise<string> {
    const animal = await this.almacenLocal.animalPorUuid(uuid);
    return animal ? etiquetaAnimal(animal) : 'un animal';
  }

  //---------------------------------------------REGISTRAR---------------------------------------------------------------------------

  //ORDEÑO DE UNA VACA EN UNA JORNADA. EN EL ORDEÑO EN LOTE SE LLAMA UNA VEZ POR VACA
  async registrarOrdeno(datos: DatosOrdeno): Promise<string> {
    const uuid = crypto.randomUUID();
    const fila: OrdenoDTO = {
      UUID_ORDENO: uuid, UUID_ANIMAL: datos.uuid_animal, FECHA_EVENTO: datos.fecha_evento, JORNADA_ORDENO: datos.jornada_ordeno,
      LITROS_ORDENO: datos.litros_ordeno, OBSERVACION_ORDENO: datos.observacion?.trim() || null, ESTADO_ORDENO: 'ACTIVO',
    };
    await this.almacenLocal.guardarConBandeja('ORDENO', fila, {
      uuid, operacion: 'CREAR', datos, descripcion: `Ordeño de ${await this.etiqueta(datos.uuid_animal)} (${datos.jornada_ordeno === 'MANANA' ? 'mañana' : 'tarde'}): ${datos.litros_ordeno} litros`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  //VACUNA, TRATAMIENTO O DESPARASITANTE. LA PROXIMA DOSIS Y EL FIN DEL RETIRO DE LECHE SE CALCULAN CON EL CATALOGO (COMO LA BASE)
  async registrarVacunacion(datos: DatosVacunacion): Promise<{ uuid: string; proximaDosis: string | null; finRetiro: string | null }> {
    const uuid = crypto.randomUUID();
    const vacuna = (await this.almacenLocal.vacunas()).find(v => v.ID_VACUNA === datos.id_vacuna);
    const dia = datos.fecha_evento.slice(0, 10);
    const proximaDosis = vacuna?.DIAS_REFUERZO ? sumarDias(dia, vacuna.DIAS_REFUERZO) : null;
    const finRetiro = vacuna && vacuna.DIAS_RETIRO_LECHE > 0 ? sumarDias(dia, vacuna.DIAS_RETIRO_LECHE) : null;
    const fila: VacunacionDTO = {
      UUID_VACUNACION: uuid, UUID_ANIMAL: datos.uuid_animal, FECHA_EVENTO: datos.fecha_evento, ID_VACUNA: datos.id_vacuna,
      DOSIS_VACUNACION: datos.dosis_vacunacion?.trim() || null, FECHA_PROXIMA_DOSIS: proximaDosis, FECHA_FIN_RETIRO: finRetiro,
      OBSERVACION_VACUNACION: datos.observacion?.trim() || null, ESTADO_VACUNACION: 'ACTIVO',
    };
    await this.almacenLocal.guardarConBandeja('VACUNACION', fila, {
      uuid, operacion: 'CREAR', datos, descripcion: `${vacuna?.NOM_VACUNA ?? 'Vacuna'} a ${await this.etiqueta(datos.uuid_animal)}`,
    });
    this.sincronizacion.programar();
    return { uuid, proximaDosis, finRetiro };
  }

  //MONTA O INSEMINACION. DEVUELVE EL PARTO PROBABLE (FECHA + 283 DIAS)
  async registrarServicio(datos: DatosServicio): Promise<{ uuid: string; partoProbable: string }> {
    const uuid = crypto.randomUUID();
    const fila: ServicioDTO = {
      UUID_SERVICIO: uuid, UUID_ANIMAL: datos.uuid_animal, FECHA_EVENTO: datos.fecha_evento, TIPO_SERVICIO: datos.tipo_servicio,
      UUID_TORO: datos.uuid_toro, TORO_EXTERNO: datos.toro_externo?.trim() || null, OBSERVACION_SERVICIO: datos.observacion?.trim() || null,
      ESTADO_SERVICIO: 'ACTIVO',
    };
    await this.almacenLocal.guardarConBandeja('SERVICIO', fila, {
      uuid, operacion: 'CREAR', datos, descripcion: `${datos.tipo_servicio === 'MONTA' ? 'Monta' : 'Inseminación'} de ${await this.etiqueta(datos.uuid_animal)}`,
    });
    this.sincronizacion.programar();
    return { uuid, partoProbable: sumarDias(datos.fecha_evento, DIAS_GESTACION) };
  }

  async registrarPalpacion(datos: DatosPalpacion): Promise<string> {
    const uuid = crypto.randomUUID();
    const fila: PalpacionDTO = {
      UUID_PALPACION: uuid, UUID_ANIMAL: datos.uuid_animal, FECHA_EVENTO: datos.fecha_evento, RESULTADO_PALPACION: datos.resultado_palpacion,
      MESES_GESTACION: datos.resultado_palpacion === 'PRENIADA' ? datos.meses_gestacion : null,
      OBSERVACION_PALPACION: datos.observacion?.trim() || null, ESTADO_PALPACION: 'ACTIVO',
    };
    await this.almacenLocal.guardarConBandeja('PALPACION', fila, {
      uuid, operacion: 'CREAR', datos: { ...datos, meses_gestacion: fila.MESES_GESTACION },
      descripcion: `Palpación de ${await this.etiqueta(datos.uuid_animal)}: ${datos.resultado_palpacion === 'PRENIADA' ? 'preñada' : 'vacía'}`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  //PARTO. CON CRIA VIVA, LA CRIA ENTRA AL HATO DEL CELULAR EN LA MISMA TRANSACCION (UUID GENERADO AQUI: LA BASE LA CREA CON EL MISMO)
  //PADRE: EL DEL ULTIMO SERVICIO ACTIVO DESPUES DEL PARTO ANTERIOR; LOTE: EL DE LA MADRE (IGUAL QUE FUN_CREAR_PARTO_JSON)
  //EL PESO AL NACER: LA BASE CREA SU PESAJE; EN EL CELULAR SOLO SE PONE COMO PESO ACTUAL HASTA QUE BAJE EL PESAJE OFICIAL
  async registrarParto(datos: DatosParto): Promise<{ uuidParto: string; uuidCria: string | null }> {
    const uuidParto = crypto.randomUUID();
    const madre = await this.almacenLocal.animalPorUuid(datos.uuid_animal);
    if (!madre) {
      throw new Error('La madre no está en este celular');
    }
    const uuidCria = datos.cria_viva === 'SI' ? crypto.randomUUID() : null;
    const chapeta = datos.chapeta_cria?.trim().toUpperCase() || null;
    const filas: { tipo: TipoRegistro; fila: any }[] = [];
    if (uuidCria) {
      const servicio = await this.almacenLocal.ultimoServicioAntes(madre.UUID_ANIMAL, datos.fecha_evento);
      const toro = servicio?.UUID_TORO ? await this.almacenLocal.animalPorUuid(servicio.UUID_TORO) : null;
      const dia = datos.fecha_evento.slice(0, 10);
      const cria: AnimalDTO = {
        UUID_ANIMAL: uuidCria, UUID_LOTE: madre.UUID_LOTE, NOM_LOTE: madre.NOM_LOTE ?? null, ID_RAZA: null,
        CHAPETA_ANIMAL: chapeta, NOM_ANIMAL: datos.nom_cria?.trim() || null, SEXO_ANIMAL: datos.sexo_cria ?? 'H',
        FECHA_NACIMIENTO: dia, FECHA_NACIMIENTO_ESTIMADA: 'NO',
        UUID_MADRE: madre.UUID_ANIMAL, CHAPETA_MADRE: madre.CHAPETA_ANIMAL,
        UUID_PADRE: servicio?.UUID_TORO ?? null, CHAPETA_PADRE: toro?.CHAPETA_ANIMAL ?? null, PADRE_EXTERNO: servicio?.TORO_EXTERNO ?? null,
        ORIGEN_ANIMAL: 'NACIDO', FECHA_INGRESO_ANIMAL: dia,
        PESO_ACTUAL_KG: datos.peso_cria_kg, FECHA_ULTIMO_PESAJE: datos.peso_cria_kg ? datos.fecha_evento : null, ESTADO_ANIMAL: 'ACTIVO',
      };
      filas.push({ tipo: 'ANIMAL', fila: cria });
    }
    const parto: PartoDTO = {
      UUID_PARTO: uuidParto, UUID_ANIMAL: madre.UUID_ANIMAL, FECHA_EVENTO: datos.fecha_evento, TIPO_PARTO: datos.tipo_parto,
      CRIA_VIVA: datos.cria_viva, SEXO_CRIA: datos.sexo_cria, UUID_CRIA: uuidCria, OBSERVACION_PARTO: datos.observacion?.trim() || null,
      ESTADO_PARTO: 'ACTIVO',
    };
    filas.push({ tipo: 'PARTO', fila: parto });
    const texto = datos.tipo_parto === 'ABORTO' ? 'Aborto' : datos.cria_viva === 'SI' ? `Parto: ${datos.sexo_cria === 'M' ? 'ternero' : 'ternera'}${chapeta ? ' ' + chapeta : ''}` : 'Parto (cría muerta)';
    await this.almacenLocal.guardarVariasConBandeja(filas, 'PARTO', {
      uuid: uuidParto, operacion: 'CREAR', datos: { ...datos, uuid_cria: uuidCria, chapeta_cria: chapeta }, descripcion: `${texto} de ${etiquetaAnimal(madre)}`,
    });
    //CON UN PARTO (TAMBIEN UN ABORTO) LA HEMBRA YA ES VACA: FUN_CATEGORIA_ANIMAL CUENTA TODOS LOS PARTOS ACTIVOS
    await this.almacenLocal.actualizarAnimalLocal(madre.UUID_ANIMAL, { CATEGORIA_ANIMAL: 'VACA' });
    this.sincronizacion.programar();
    return { uuidParto, uuidCria };
  }

  //VENTA, MUERTE O TRASLADO: EL ANIMAL SALE DEL HATO (EN EL SERVIDOR LO HACE EL TRIGGER TRG_SALIDA_ANIMAL)
  async registrarSalida(datos: DatosSalida): Promise<string> {
    const uuid = crypto.randomUUID();
    const fila: SalidaDTO = {
      UUID_SALIDA: uuid, UUID_ANIMAL: datos.uuid_animal, FECHA_EVENTO: datos.fecha_evento, TIPO_SALIDA: datos.tipo_salida,
      VALOR_SALIDA: datos.valor_salida, PESO_SALIDA_KG: datos.peso_salida_kg, CAUSA_SALIDA: datos.causa_salida?.trim() || null,
      OBSERVACION_SALIDA: datos.observacion?.trim() || null, ESTADO_SALIDA: 'ACTIVO',
    };
    const etiqueta = await this.etiqueta(datos.uuid_animal);
    await this.almacenLocal.guardarConBandeja('SALIDA', fila, {
      uuid, operacion: 'CREAR', datos, descripcion: `${datos.tipo_salida === 'VENTA' ? 'Venta' : datos.tipo_salida === 'MUERTE' ? 'Muerte' : 'Traslado'} de ${etiqueta}`,
    });
    await this.almacenLocal.actualizarAnimalLocal(datos.uuid_animal, {
      ESTADO_ANIMAL: datos.tipo_salida === 'VENTA' ? 'VENDIDO' : datos.tipo_salida === 'MUERTE' ? 'MUERTO' : 'TRASLADADO',
      FECHA_SALIDA_ANIMAL: datos.fecha_evento,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  //---------------------------------------------ANULAR (SOLO EL DUEÑO; LO REVISA LA BASE)-------------------------------------------

  //ANULA UN EVENTO: SALE DE LA LINEA DE TIEMPO Y DE LAS CUENTAS. LOS EFECTOS EN LA FICHA LOCAL IMITAN A LA BASE:
  //SALIDA -> EL ANIMAL VUELVE A ACTIVO; PARTO -> TAMBIEN SE ANULA SU CRIA (SI NO TIENE REGISTROS PROPIOS); PESAJE -> SE RECALCULA EL PESO
  async anularEvento(tipo: Exclude<TipoRegistro, 'LOTE' | 'ANIMAL'>, uuid: string): Promise<void> {
    const columnaEstado: Record<string, string> = {
      PESAJE: 'ESTADO_PESAJE', VACUNACION: 'ESTADO_VACUNACION', SERVICIO: 'ESTADO_SERVICIO', PALPACION: 'ESTADO_PALPACION',
      PARTO: 'ESTADO_PARTO', ORDENO: 'ESTADO_ORDENO', SALIDA: 'ESTADO_SALIDA',
    };
    const evento = await this.almacenLocal.eventoPorUuid(tipo, uuid);
    if (!evento) {
      throw new Error('Ese registro no está en este celular');
    }
    if (tipo === 'PARTO' && evento.UUID_CRIA) {
      const registrosCria = await this.almacenLocal.contarEventosActivos(evento.UUID_CRIA);
      const pesajesCria = (await firstValueFrom(this.almacenLocal.observarEventosDeAnimal(evento.UUID_CRIA))).pesajes.length;
      const criasDeLaCria = (await firstValueFrom(this.almacenLocal.observarCrias(evento.UUID_CRIA))).length;
      if (registrosCria - pesajesCria > 0 || criasDeLaCria > 0) {
        throw new Error('La cría de este parto ya tiene registros propios: anúlalos primero');
      }
    }
    const etiqueta = await this.etiqueta(evento.UUID_ANIMAL);
    const nombres: Record<string, string> = {
      PESAJE: 'pesaje', VACUNACION: 'vacuna', SERVICIO: 'servicio', PALPACION: 'palpación', PARTO: 'parto', ORDENO: 'ordeño', SALIDA: 'salida',
    };
    await this.almacenLocal.cambiarConBandeja(tipo, uuid, { [columnaEstado[tipo]]: 'ANULADO' }, {
      operacion: 'ANULAR', datos: {}, descripcion: `Anular ${nombres[tipo]} de ${etiqueta}`,
    });
    if (tipo === 'SALIDA') {
      await this.almacenLocal.actualizarAnimalLocal(evento.UUID_ANIMAL, { ESTADO_ANIMAL: 'ACTIVO', FECHA_SALIDA_ANIMAL: null });
    }
    if (tipo === 'PARTO' && evento.UUID_CRIA) {
      await this.almacenLocal.actualizarAnimalLocal(evento.UUID_CRIA, { ESTADO_ANIMAL: 'ANULADO' });
    }
    if (tipo === 'PARTO') {
      const quedan = await this.almacenLocal.partosDe(evento.UUID_ANIMAL);
      if (quedan.length === 0) {
        await this.almacenLocal.actualizarAnimalLocal(evento.UUID_ANIMAL, { CATEGORIA_ANIMAL: null });
      }
    }
    if (tipo === 'PESAJE') {
      const pesajes = (await firstValueFrom(this.almacenLocal.observarEventosDeAnimal(evento.UUID_ANIMAL))).pesajes
        .sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO));
      await this.almacenLocal.actualizarAnimalLocal(evento.UUID_ANIMAL, {
        PESO_ACTUAL_KG: pesajes[0]?.PESO_KG ?? null, FECHA_ULTIMO_PESAJE: pesajes[0]?.FECHA_EVENTO ?? null,
      });
    }
    this.sincronizacion.programar();
  }
}
