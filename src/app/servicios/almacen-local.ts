import { Injectable } from '@angular/core';
import Dexie, { liveQuery, Table } from 'dexie';
import { from, Observable } from 'rxjs';
import { AnimalDTO, CambiosDTO, LoteDTO, PesajeDTO, RazaDTO, RegistroBandeja, ResultadoRegistro, TipoRegistro, VacunaDTO } from '../Modelos/GanaderoModel';

// ALMACEN LOCAL DE GANADERO (DEXIE SOBRE INDEXEDDB). ES EL UNICO ARCHIVO QUE TOCA INDEXEDDB (DECISION DEL 22/10/2026)
// UNA BASE POR FINCA ("ganadero-finca-<ID_FINCA>") CON DOS PARTES:
//   1. LA COPIA DE LA FINCA: LO QUE BAJA DEL SERVIDOR (FUN_OBTENER_CAMBIOS_JSON) MAS LO REGISTRADO EN EL CELULAR QUE AUN NO SUBE (_pendiente)
//   2. LA BANDEJA DE SALIDA: LO QUE FALTA SUBIR, EN EL ORDEN EN QUE SE REGISTRO (orden AUTOINCREMENTAL)
// REGISTRAR = UNA SOLA TRANSACCION LOCAL: LA FILA EN SU TABLA (APARECE DE INMEDIATO) Y SU REGISTRO EN LA BANDEJA

//TABLA DE LA COPIA LOCAL DE CADA TIPO DE REGISTRO Y SU LLAVE (EL UUID QUE GENERA EL CELULAR)
const TABLA_POR_TIPO: Record<TipoRegistro, { tabla: string; llave: string }> = {
  LOTE: { tabla: 'lotes', llave: 'UUID_LOTE' },
  ANIMAL: { tabla: 'animales', llave: 'UUID_ANIMAL' },
  PESAJE: { tabla: 'pesajes', llave: 'UUID_PESAJE' },
  VACUNACION: { tabla: 'vacunaciones', llave: 'UUID_VACUNACION' },
  SERVICIO: { tabla: 'servicios', llave: 'UUID_SERVICIO' },
  PALPACION: { tabla: 'palpaciones', llave: 'UUID_PALPACION' },
  PARTO: { tabla: 'partos', llave: 'UUID_PARTO' },
  ORDENO: { tabla: 'ordenos', llave: 'UUID_ORDENO' },
  SALIDA: { tabla: 'salidas', llave: 'UUID_SALIDA' },
};

const PREFIJO_BASE = 'ganadero-finca-';

class BaseFinca extends Dexie {
  animales!: Table<AnimalDTO, string>;
  lotes!: Table<LoteDTO, string>;
  pesajes!: Table<PesajeDTO, string>;
  vacunaciones!: Table<any, string>;
  servicios!: Table<any, string>;
  palpaciones!: Table<any, string>;
  partos!: Table<any, string>;
  ordenos!: Table<any, string>;
  salidas!: Table<any, string>;
  razas!: Table<RazaDTO, number>;
  vacunas!: Table<VacunaDTO, number>;
  ciclos!: Table<any, number>;
  personas!: Table<any, string>;
  bandeja!: Table<RegistroBandeja, number>;
  meta!: Table<{ clave: string; valor: any }, string>;

  constructor(nombre: string) {
    super(nombre);
    //VERSION 1. SI SE AGREGA UN INDICE, SE SUBE LA VERSION (DEXIE MIGRA SOLO) Y NUNCA SE CAMBIA UNA VERSION YA PUBLICADA
    this.version(1).stores({
      animales: 'UUID_ANIMAL, CHAPETA_ANIMAL, ESTADO_ANIMAL',
      lotes: 'UUID_LOTE',
      pesajes: 'UUID_PESAJE, UUID_ANIMAL',
      vacunaciones: 'UUID_VACUNACION, UUID_ANIMAL',
      servicios: 'UUID_SERVICIO, UUID_ANIMAL',
      palpaciones: 'UUID_PALPACION, UUID_ANIMAL',
      partos: 'UUID_PARTO, UUID_ANIMAL',
      ordenos: 'UUID_ORDENO, UUID_ANIMAL',
      salidas: 'UUID_SALIDA, UUID_ANIMAL',
      razas: 'ID_RAZA',
      vacunas: 'ID_VACUNA',
      ciclos: 'ID_CICLO',
      personas: 'ID_USUARIO',
      bandeja: '++orden, uuid, estado',
      meta: 'clave',
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class AlmacenLocalService {
  private base: BaseFinca | null = null;
  private idFinca: number | null = null;

  //ABRE (O CREA) LA BASE DE LA FINCA. SE LLAMA AL ELEGIR LA FINCA Y AL ABRIR LA APP
  abrir(idFinca: number): void {
    if (this.idFinca === idFinca && this.base) {
      return;
    }
    this.base?.close();
    this.base = new BaseFinca(PREFIJO_BASE + idFinca);
    this.idFinca = idFinca;
  }

  get abierta(): boolean {
    return this.base !== null;
  }

  private get db(): BaseFinca {
    if (!this.base) {
      throw new Error('No hay una finca abierta en el celular');
    }
    return this.base;
  }

  //---------------------------------------------REGISTRAR SIN SEÑAL--------------------------------------------------------------

  //GUARDA LA FILA EN LA COPIA LOCAL Y LA PONE EN LA BANDEJA, TODO EN UNA TRANSACCION (O LAS DOS O NINGUNA)
  async guardarConBandeja(tipo: TipoRegistro, fila: any, registro: Omit<RegistroBandeja, 'orden' | 'estado' | 'fechaCreacion' | 'tipo'>): Promise<void> {
    const { tabla } = TABLA_POR_TIPO[tipo];
    const db = this.db;
    await db.transaction('rw', db.table(tabla), db.bandeja, async () => {
      await db.table(tabla).put({ ...fila, _pendiente: true });
      await db.bandeja.add({ ...registro, tipo, estado: 'PENDIENTE', fechaCreacion: new Date().toISOString() });
    });
  }

  //---------------------------------------------BANDEJA DE SALIDA----------------------------------------------------------------

  //LO QUE FALTA SUBIR, EN ORDEN (LOS RECHAZADOS NO SE REENVIAN SOLOS: ESPERAN A QUE LA PERSONA LOS CORRIJA O DESCARTE)
  pendientes(limite: number): Promise<RegistroBandeja[]> {
    return this.db.bandeja.where('estado').equals('PENDIENTE').sortBy('orden').then(lista => lista.slice(0, limite));
  }

  bandejaCompleta(): Promise<RegistroBandeja[]> {
    return this.db.bandeja.orderBy('orden').toArray();
  }

  contarPendientes(): Promise<number> {
    return this.db.bandeja.where('estado').equals('PENDIENTE').count();
  }

  //CONTEOS QUE SE ACTUALIZAN SOLOS CUANDO CAMBIA LA BANDEJA (PARA EL INDICADOR "☁ TODO GUARDADO" / "📱 5 POR SUBIR")
  observarBandeja(): Observable<{ pendientes: number; rechazados: number }> {
    const db = this.db;
    return from(liveQuery(async () => ({
      pendientes: await db.bandeja.where('estado').equals('PENDIENTE').count(),
      rechazados: await db.bandeja.where('estado').equals('RECHAZADO').count(),
    })));
  }

  //APLICA LA RESPUESTA DE /SincronizarRegistros: OK Y YA_EXISTIA SALEN DE LA BANDEJA; RECHAZADO QUEDA CON SU MENSAJE
  async aplicarResultados(resultados: ResultadoRegistro[]): Promise<void> {
    const db = this.db;
    await db.transaction('rw', db.bandeja, async () => {
      for (const r of resultados) {
        const registros = await db.bandeja.where('uuid').equals(r.UUID).toArray();
        //EL MISMO UUID PUEDE ESTAR DOS VECES (CREAR Y LUEGO ANULAR): SE RESUELVE EL QUE TRAE ESE orden SI VIENE
        const objetivo = registros.find(x => r.ORDEN === undefined || x.orden === Number(r.ORDEN)) ?? registros[0];
        if (!objetivo) {
          continue;
        }
        if (r.ESTADO === 'RECHAZADO') {
          await db.bandeja.update(objetivo.orden!, { estado: 'RECHAZADO', mensaje: r.MENSAJE ?? 'El servidor no lo aceptó' });
        } else {
          await db.bandeja.delete(objetivo.orden!);
        }
      }
    });
  }

  //VUELVE A PONER UN RECHAZADO EN LA COLA (POR EJEMPLO, DESPUES DE CORREGIR EL ANIMAL)
  reintentar(orden: number): Promise<number> {
    return this.db.bandeja.update(orden, { estado: 'PENDIENTE', mensaje: null });
  }

  //DESCARTA UN RECHAZADO: SALE DE LA BANDEJA Y, SI ERA UN REGISTRO NUEVO, TAMBIEN DE LA COPIA LOCAL (EL SERVIDOR NUNCA LO TUVO)
  async descartar(orden: number): Promise<void> {
    const db = this.db;
    const registro = await db.bandeja.get(orden);
    if (!registro) {
      return;
    }
    const { tabla, llave } = TABLA_POR_TIPO[registro.tipo];
    await db.transaction('rw', db.bandeja, db.table(tabla), async () => {
      await db.bandeja.delete(orden);
      if (registro.operacion === 'CREAR') {
        const fila = await db.table(tabla).get(registro.uuid);
        if (fila?._pendiente) {
          await db.table(tabla).where(llave).equals(registro.uuid).delete();
        }
      }
    });
  }

  //---------------------------------------------BAJAR CAMBIOS--------------------------------------------------------------------

  //GUARDA LO QUE BAJO DEL SERVIDOR. LO DEL SERVIDOR REEMPLAZA A LA COPIA LOCAL POR UUID (Y LE QUITA _pendiente)
  //LA PRIMERA VEZ (COMPLETO) SE VACIA LA COPIA, PERO SE CONSERVA LO QUE AUN NO HA SUBIDO
  async aplicarCambios(cambios: CambiosDTO): Promise<void> {
    const db = this.db;
    const tablasFinca: [string, any[]][] = [
      ['lotes', cambios.LOTES], ['animales', cambios.ANIMALES], ['pesajes', cambios.PESAJES],
      ['vacunaciones', cambios.VACUNACIONES], ['servicios', cambios.SERVICIOS], ['palpaciones', cambios.PALPACIONES],
      ['partos', cambios.PARTOS], ['ordenos', cambios.ORDENOS], ['salidas', cambios.SALIDAS],
      ['razas', cambios.RAZAS], ['vacunas', cambios.VACUNAS], ['ciclos', cambios.CICLOS_ICA], ['personas', cambios.PERSONAS],
    ];
    await db.transaction('rw', [...tablasFinca.map(([t]) => db.table(t)), db.meta], async () => {
      for (const [tabla, filas] of tablasFinca) {
        if (cambios.COMPLETO) {
          await db.table(tabla).filter((f: any) => !f._pendiente).delete();
        }
        if (filas?.length) {
          await db.table(tabla).bulkPut(filas.map(f => ({ ...f, _pendiente: false })));
        }
      }
      await db.meta.put({ clave: 'MARCA', valor: cambios.MARCA });
      await db.meta.put({ clave: 'ROL_FINCA', valor: cambios.ROL_FINCA });
      await db.meta.put({ clave: 'ULTIMA_BAJADA', valor: new Date().toISOString() });
      if (cambios.FINCA) {
        await db.meta.put({ clave: 'FINCA', valor: cambios.FINCA });
      }
    });
  }

  async leerMeta<T = any>(clave: string): Promise<T | null> {
    return (await this.db.meta.get(clave))?.valor ?? null;
  }

  guardarMeta(clave: string, valor: any): Promise<string> {
    return this.db.meta.put({ clave, valor });
  }

  //---------------------------------------------LECTURAS PARA LAS PANTALLAS-------------------------------------------------------

  //EL HATO DE HOY (ACTIVOS), QUE SE ACTUALIZA SOLO AL REGISTRAR O AL SINCRONIZAR
  observarAnimales(soloActivos = true): Observable<AnimalDTO[]> {
    const db = this.db;
    return from(liveQuery(async () => {
      const lista = await db.animales.toArray();
      return lista.filter(a => a.ESTADO_ANIMAL !== 'ANULADO' && (!soloActivos || a.ESTADO_ANIMAL === 'ACTIVO'));
    }));
  }

  animalPorUuid(uuid: string): Promise<AnimalDTO | undefined> {
    return this.db.animales.get(uuid);
  }

  //BUSCA POR CHAPETA SIN IMPORTAR MAYUSCULAS (LA BASE LA GUARDA EN MAYUSCULAS)
  async animalPorChapeta(chapeta: string): Promise<AnimalDTO | undefined> {
    const texto = chapeta.trim().toUpperCase();
    return (await this.db.animales.where('CHAPETA_ANIMAL').equals(texto).toArray()).find(a => a.ESTADO_ANIMAL !== 'ANULADO');
  }

  //PESO ACTUAL EN EL CELULAR MIENTRAS EL PESAJE NO SUBE (EN EL SERVIDOR LO MANTIENE EL TRIGGER TRG_PESO_ACTUAL Y LO BAJA LUEGO)
  actualizarPesoLocal(uuidAnimal: string, peso: number, fecha: string): Promise<number> {
    return this.db.animales.update(uuidAnimal, { PESO_ACTUAL_KG: peso, FECHA_ULTIMO_PESAJE: fecha });
  }

  observarPesajesDeAnimal(uuidAnimal: string): Observable<PesajeDTO[]> {
    const db = this.db;
    return from(liveQuery(async () => {
      const lista = await db.pesajes.where('UUID_ANIMAL').equals(uuidAnimal).toArray();
      return lista.filter(p => p.ESTADO_PESAJE === 'ACTIVO').sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO));
    }));
  }

  observarBandejaCompleta(): Observable<RegistroBandeja[]> {
    const db = this.db;
    return from(liveQuery(() => db.bandeja.orderBy('orden').toArray()));
  }

  razas(): Promise<RazaDTO[]> {
    return this.db.razas.toArray().then(l => l.filter(r => r.ESTADO_RAZA !== 'INACTIVO').sort((a, b) => a.NOM_RAZA.localeCompare(b.NOM_RAZA)));
  }

  lotes(): Promise<LoteDTO[]> {
    return this.db.lotes.toArray().then(l => l.filter(x => x.ESTADO_LOTE === 'ACTIVO'));
  }

  //---------------------------------------------AL CERRAR SESION-----------------------------------------------------------------

  //BORRA TODAS LAS FINCAS GUARDADAS EN ESTE CELULAR (SOLO SE LLAMA CUANDO YA NO QUEDA NADA POR SUBIR O LA PERSONA LO ACEPTA)
  async borrarTodo(): Promise<void> {
    this.base?.close();
    this.base = null;
    this.idFinca = null;
    const nombres = await Dexie.getDatabaseNames();
    await Promise.all(nombres.filter(n => n.startsWith(PREFIJO_BASE)).map(n => Dexie.delete(n)));
  }

  //CUANTO FALTA POR SUBIR EN TODAS LAS FINCAS DEL CELULAR (PARA AVISAR ANTES DE CERRAR SESION)
  async pendientesEnTodasLasFincas(): Promise<number> {
    const nombres = (await Dexie.getDatabaseNames()).filter(n => n.startsWith(PREFIJO_BASE));
    let total = 0;
    for (const nombre of nombres) {
      const base = new BaseFinca(nombre);
      total += await base.bandeja.count();
      base.close();
    }
    return total;
  }
}
