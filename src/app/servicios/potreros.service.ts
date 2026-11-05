import { Injectable } from '@angular/core';
import { LoteDTO, OcupacionDTO, PotreroDTO } from '../Modelos/GanaderoModel';
import { AlmacenLocalService } from './almacen-local';
import { hoyLocal } from './hato.service';
import { SincronizacionService } from './sincronizacion.service';

//DATOS DEL FORMULARIO DE UN POTRERO (snake_case: VAN TAL CUAL EN "datos" DE LA BANDEJA, COMO LOS ESPERA LA BASE)
export interface DatosPotrero {
  nom_potrero: string;
  area_potrero: number | null;
  dias_descanso_potrero: number;
  contorno_potrero: [number, number][] | null;
}

export type EstadoPotrero = 'OCUPADO' | 'DESCANSANDO' | 'LISTO' | 'SIN_USO';

//EL ESTADO DE HOY DE UN POTRERO, CON LOS LOTES QUE TIENE ADENTRO
export interface EstadoHoyPotrero {
  estado: EstadoPotrero;
  diasOcupado: number | null;
  diasDescanso: number | null;
  lotes: { uuidLote: string; nomLote: string; uuidOcupacion: string; entrada: string; dias: number }[];
}

//DIAS ENTRE DOS FECHAS AAAA-MM-DD (SOLO EL DIA, COMO CURRENT_DATE - FECHA::DATE EN LA BASE)
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = hasta.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

//EL MISMO CALCULO DE FUN_ESTADO_POTRERO (LA REGLA OFICIAL ESTA EN LA BASE). SE REPITE AQUI PARA VERLO SIN SEÑAL, COMO categoriaAnimal():
//OCUPADO SI TIENE LOTES ADENTRO; SI NO, DESCANSANDO O LISTO SEGUN LOS DIAS DESDE LA ULTIMA SALIDA; SIN_USO SI NUNCA SE USO
export function estadoPotrero(potrero: PotreroDTO, ocupaciones: OcupacionDTO[], lotes: LoteDTO[], hoy = hoyLocal()): EstadoHoyPotrero {
  const propias = ocupaciones.filter(o => o.UUID_POTRERO === potrero.UUID_POTRERO && o.ESTADO_OCUPACION === 'ACTIVO');
  const abiertas = propias.filter(o => !o.FECHA_SALIDA_OCUPACION).sort((a, b) => a.FECHA_EVENTO.localeCompare(b.FECHA_EVENTO));
  if (abiertas.length) {
    return {
      estado: 'OCUPADO',
      diasOcupado: diasEntre(abiertas[0].FECHA_EVENTO, hoy),
      diasDescanso: null,
      lotes: abiertas.map(o => ({
        uuidLote: o.UUID_LOTE, nomLote: lotes.find(l => l.UUID_LOTE === o.UUID_LOTE)?.NOM_LOTE ?? 'Lote', uuidOcupacion: o.UUID_OCUPACION,
        entrada: o.FECHA_EVENTO, dias: diasEntre(o.FECHA_EVENTO, hoy),
      })),
    };
  }
  const salidas = propias.map(o => o.FECHA_SALIDA_OCUPACION!).filter(Boolean).sort();
  if (!salidas.length) {
    return { estado: 'SIN_USO', diasOcupado: null, diasDescanso: null, lotes: [] };
  }
  const dias = diasEntre(salidas[salidas.length - 1], hoy);
  return { estado: dias >= Number(potrero.DIAS_DESCANSO_POTRERO) ? 'LISTO' : 'DESCANSANDO', diasOcupado: null, diasDescanso: dias, lotes: [] };
}

//AREA DE UN CONTORNO EN HECTAREAS (FORMULA ESFERICA, LA MISMA IDEA DE L.GeometryUtil.geodesicArea). SOLO SUGIERE EL AREA AL DIBUJAR
export function areaHectareas(puntos: [number, number][]): number {
  if (puntos.length < 3) return 0;
  const R = 6378137;
  const rad = (g: number) => (g * Math.PI) / 180;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [lat1, lng1] = puntos[i];
    const [lat2, lng2] = puntos[(i + 1) % puntos.length];
    suma += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((suma * R * R) / 2) / 10000;
}

//POTREROS Y ROTACION DE LOS LOTES (FASE 5A). TODO SIN SEÑAL: SE GUARDA EN EL CELULAR Y VA A LA BANDEJA; LA BASE VUELVE A REVISAR LAS REGLAS
//CREAR POTREROS Y MOVER LOTES: DUEÑO Y VAQUERO. EDITAR, ANULAR POTREROS Y ANULAR MOVIMIENTOS: SOLO EL DUEÑO (LO REVISA LA BASE)
@Injectable({
  providedIn: 'root'
})
export class PotrerosService {
  constructor(
    private almacenLocal: AlmacenLocalService,
    private sincronizacion: SincronizacionService,
  ) {}

  private limpiar(datos: DatosPotrero): DatosPotrero {
    return { ...datos, nom_potrero: datos.nom_potrero.trim().replace(/\s+/g, ' ') };
  }

  private fila(uuid: string, d: DatosPotrero): Partial<PotreroDTO> {
    return { UUID_POTRERO: uuid, NOM_POTRERO: d.nom_potrero, AREA_POTRERO: d.area_potrero, DIAS_DESCANSO_POTRERO: d.dias_descanso_potrero, CONTORNO_POTRERO: d.contorno_potrero };
  }

  async crearPotrero(datos: DatosPotrero): Promise<string> {
    const uuid = crypto.randomUUID();
    const d = this.limpiar(datos);
    await this.almacenLocal.guardarConBandeja('POTRERO', { ...this.fila(uuid, d), ESTADO_POTRERO: 'ACTIVO' }, {
      uuid, operacion: 'CREAR', datos: d, descripcion: `Potrero nuevo: ${d.nom_potrero}`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  async editarPotrero(uuid: string, datos: DatosPotrero): Promise<void> {
    const d = this.limpiar(datos);
    await this.almacenLocal.cambiarConBandeja('POTRERO', uuid, this.fila(uuid, d), {
      operacion: 'EDITAR', datos: d, descripcion: `Potrero editado: ${d.nom_potrero}`,
    });
    this.sincronizacion.programar();
  }

  async anularPotrero(uuid: string, nombre: string): Promise<void> {
    await this.almacenLocal.cambiarConBandeja('POTRERO', uuid, { ESTADO_POTRERO: 'ANULADO' }, {
      operacion: 'ANULAR', datos: {}, descripcion: `Anular el potrero ${nombre}`,
    });
    this.sincronizacion.programar();
  }

  //METER UN LOTE A UN POTRERO (SI ESTABA EN OTRO, SALE DE ESE CON LA MISMA FECHA). fecha EN AAAA-MM-DDTHH:mm
  async entrarLote(uuidLote: string, nomLote: string, potrero: PotreroDTO, fecha: string, observacion: string | null): Promise<string> {
    const uuid = crypto.randomUUID();
    const ocupacion: OcupacionDTO = {
      UUID_OCUPACION: uuid, UUID_POTRERO: potrero.UUID_POTRERO, UUID_LOTE: uuidLote, FECHA_EVENTO: fecha,
      FECHA_SALIDA_OCUPACION: null, OBSERVACION_OCUPACION: observacion, ESTADO_OCUPACION: 'ACTIVO',
    };
    await this.almacenLocal.entrarLoteConBandeja(ocupacion, {
      uuid, operacion: 'CREAR',
      datos: { uuid_lote: uuidLote, uuid_potrero: potrero.UUID_POTRERO, fecha_evento: fecha, observacion },
      descripcion: `El lote ${nomLote} entró al potrero ${potrero.NOM_POTRERO}`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  //SACAR UN LOTE DE SU POTRERO SIN METERLO A OTRO
  async sacarLote(uuidOcupacion: string, nomLote: string, nomPotrero: string, fecha: string): Promise<void> {
    await this.almacenLocal.cambiarConBandeja('OCUPACION', uuidOcupacion, { FECHA_SALIDA_OCUPACION: fecha }, {
      operacion: 'EDITAR', datos: { fecha_salida_ocupacion: fecha }, descripcion: `El lote ${nomLote} salió del potrero ${nomPotrero}`,
    });
    this.sincronizacion.programar();
  }

  //ANULAR EL ULTIMO MOVIMIENTO DE UN LOTE (EL LOTE VUELVE A DONDE ESTABA)
  async anularMovimiento(ocupacion: OcupacionDTO, descripcion: string): Promise<void> {
    await this.almacenLocal.anularOcupacionConBandeja(ocupacion, { operacion: 'ANULAR', datos: {}, descripcion });
    this.sincronizacion.programar();
  }
}
