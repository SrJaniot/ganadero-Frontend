import { Injectable } from '@angular/core';
import Dexie, { liveQuery, Table } from 'dexie';
import { from, Observable } from 'rxjs';
import { AnimalDTO, CambiosDTO, EventosAnimal, LoteDTO, OrdenoDTO, PartoDTO, PesajeDTO, RazaDTO, RegistroBandeja, ResultadoRegistro, ServicioDTO, TipoRegistro, VacunaDTO } from '../Modelos/GanaderoModel';

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
  fotos!: Table<{ uuid: string; archivo: string; foto: Blob }, string>;

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
    //VERSION 2 (FASE 1): FOTOS DE LOS ANIMALES GUARDADAS EN EL CELULAR PARA VERLAS SIN SEÑAL (archivo = NOMBRE EN EL SERVIDOR)
    this.version(2).stores({
      fotos: 'uuid',
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

  //EDITAR O ANULAR SIN SEÑAL: SE CAMBIA LA FILA LOCAL (QUEDA _pendiente) Y EL CAMBIO VA A LA BANDEJA, EN UNA TRANSACCION
  //EN EL SERVIDOR GANA EL ULTIMO QUE SINCRONIZA (PLAN_GANADERO.md, SECCION 4.4)
  async cambiarConBandeja(tipo: TipoRegistro, uuid: string, cambiosFila: any, registro: Omit<RegistroBandeja, 'orden' | 'estado' | 'fechaCreacion' | 'tipo' | 'uuid'>): Promise<void> {
    const { tabla } = TABLA_POR_TIPO[tipo];
    const db = this.db;
    await db.transaction('rw', db.table(tabla), db.bandeja, async () => {
      await db.table(tabla).update(uuid, { ...cambiosFila, _pendiente: true });
      await db.bandeja.add({ ...registro, uuid, tipo, estado: 'PENDIENTE', fechaCreacion: new Date().toISOString() });
    });
  }

  //VARIAS FILAS Y UN SOLO REGISTRO DE LA BANDEJA EN UNA TRANSACCION (EL PARTO: LA CRIA Y EL PARTO ENTRAN JUNTOS O NINGUNO,
  //IGUAL QUE EN LA BASE). LA BANDEJA LLEVA SOLO EL PARTO: LA BASE CREA LA CRIA CON EL UUID QUE MANDA EL CELULAR
  async guardarVariasConBandeja(filas: { tipo: TipoRegistro; fila: any }[], tipoRegistro: TipoRegistro, registro: Omit<RegistroBandeja, 'orden' | 'estado' | 'fechaCreacion' | 'tipo'>): Promise<void> {
    const db = this.db;
    const tablas = [...new Set(filas.map(f => TABLA_POR_TIPO[f.tipo].tabla))].map(t => db.table(t));
    await db.transaction('rw', [...tablas, db.bandeja], async () => {
      for (const { tipo, fila } of filas) {
        await db.table(TABLA_POR_TIPO[tipo].tabla).put({ ...fila, _pendiente: true });
      }
      await db.bandeja.add({ ...registro, tipo: tipoRegistro, estado: 'PENDIENTE', fechaCreacion: new Date().toISOString() });
    });
  }

  //CAMBIOS EN LA FICHA LOCAL QUE HACE UN EVENTO (ESTADO POR UNA SALIDA, PESO DE LA CRIA). EN EL SERVIDOR LOS HACEN LOS TRIGGERS
  //NO VAN A LA BANDEJA: AL SINCRONIZAR, LA BAJADA TRAE LA FICHA OFICIAL
  actualizarAnimalLocal(uuid: string, cambios: Partial<AnimalDTO>): Promise<number> {
    return this.db.animales.update(uuid, cambios);
  }

  //AL ANULAR UN LOTE SIN SEÑAL, SUS ANIMALES QUEDAN SIN LOTE EN EL CELULAR (LA BASE HACE LO MISMO AL SUBIR)
  async quitarLoteDeAnimales(uuidLote: string): Promise<void> {
    await this.db.animales.filter(a => a.UUID_LOTE === uuidLote).modify({ UUID_LOTE: null, NOM_LOTE: null });
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
  //SI ERA UNA EDICION O UNA ANULACION, LA FILA LOCAL TIENE CAMBIOS QUE EL SERVIDOR NO ACEPTO: SE BORRA LA MARCA PARA QUE
  //LA PROXIMA SINCRONIZACION BAJE LA FINCA COMPLETA Y LA FILA VUELVA A COMO ESTA EN EL SERVIDOR
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
      } else {
        const otros = await db.bandeja.where('uuid').equals(registro.uuid).count();
        if (otros === 0) {
          await db.table(tabla).update(registro.uuid, { _pendiente: false });
        }
      }
    });
    if (registro.operacion !== 'CREAR') {
      await db.meta.delete('MARCA');
    }
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

  //UN VALOR DE meta QUE SE ACTUALIZA SOLO (LAS ALERTAS GUARDADAS EN LA ULTIMA SINCRONIZACION)
  observarMeta<T = any>(clave: string): Observable<T | null> {
    const db = this.db;
    return from(liveQuery(async () => ((await db.meta.get(clave))?.valor ?? null) as T | null));
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

  //UN SOLO ANIMAL, QUE SE ACTUALIZA SOLO (LA FICHA)
  observarAnimal(uuid: string): Observable<AnimalDTO | undefined> {
    const db = this.db;
    return from(liveQuery(() => db.animales.get(uuid)));
  }

  //LAS CRIAS DE UN ANIMAL (ES SU MADRE O SU PADRE)
  observarCrias(uuid: string): Observable<AnimalDTO[]> {
    const db = this.db;
    return from(liveQuery(async () => (await db.animales.toArray())
      .filter(a => a.ESTADO_ANIMAL !== 'ANULADO' && (a.UUID_MADRE === uuid || a.UUID_PADRE === uuid))
      .sort((a, b) => b.FECHA_NACIMIENTO.localeCompare(a.FECHA_NACIMIENTO))));
  }

  //LOS LOTES ACTIVOS CON CUANTOS ANIMALES ACTIVOS TIENE CADA UNO
  observarLotes(): Observable<(LoteDTO & { ANIMALES_ACTIVOS: number })[]> {
    const db = this.db;
    return from(liveQuery(async () => {
      const lotes = (await db.lotes.toArray()).filter(l => l.ESTADO_LOTE === 'ACTIVO');
      const animales = (await db.animales.toArray()).filter(a => a.ESTADO_ANIMAL === 'ACTIVO');
      return lotes
        .map(l => ({ ...l, ANIMALES_ACTIVOS: animales.filter(a => a.UUID_LOTE === l.UUID_LOTE).length }))
        .sort((a, b) => a.NOM_LOTE.localeCompare(b.NOM_LOTE));
    }));
  }

  //EVENTOS ACTIVOS DE UN ANIMAL EN EL CELULAR (PARA AVISAR ANTES DE ANULARLO: LA BASE NO DEJA ANULAR SI TIENE REGISTROS)
  //LOS PARTOS ACTIVOS DE UNA HEMBRA (PARA SABER SI ES VACA Y PARA LA REGLA DE LOS DIAS ENTRE PARTOS)
  partosDe(uuid: string): Promise<PartoDTO[]> {
    return this.db.partos.where('UUID_ANIMAL').equals(uuid).toArray().then(l => l.filter(p => p.ESTADO_PARTO === 'ACTIVO'));
  }

  async contarEventosActivos(uuid: string): Promise<number> {
    const db = this.db;
    let total = (await db.pesajes.where('UUID_ANIMAL').equals(uuid).toArray()).filter(p => p.ESTADO_PESAJE === 'ACTIVO').length;
    for (const tabla of ['vacunaciones', 'servicios', 'palpaciones', 'partos', 'ordenos', 'salidas']) {
      total += (await db.table(tabla).where('UUID_ANIMAL').equals(uuid).toArray()).filter((f: any) => Object.keys(f).some(k => k.startsWith('ESTADO_') && f[k] === 'ACTIVO')).length;
    }
    return total;
  }

  //---------------------------------------------EVENTOS (FASE 2)----------------------------------------------------------------

  //TODO LO ACTIVO QUE LE HA PASADO A UN ANIMAL, SE ACTUALIZA SOLO (LINEA DE TIEMPO DE LA FICHA SIN SEÑAL)
  observarEventosDeAnimal(uuid: string): Observable<EventosAnimal> {
    const db = this.db;
    const activos = async (tabla: string, estado: string) =>
      (await db.table(tabla).where('UUID_ANIMAL').equals(uuid).toArray()).filter((f: any) => f[estado] === 'ACTIVO');
    return from(liveQuery(async () => ({
      pesajes: await activos('pesajes', 'ESTADO_PESAJE'),
      vacunaciones: await activos('vacunaciones', 'ESTADO_VACUNACION'),
      servicios: await activos('servicios', 'ESTADO_SERVICIO'),
      palpaciones: await activos('palpaciones', 'ESTADO_PALPACION'),
      partos: await activos('partos', 'ESTADO_PARTO'),
      ordenos: await activos('ordenos', 'ESTADO_ORDENO'),
      salidas: await activos('salidas', 'ESTADO_SALIDA'),
    })));
  }

  //EL CATALOGO DE VACUNAS Y TRATAMIENTOS QUE BAJO DEL SERVIDOR (SOLO LOS ACTIVOS)
  vacunas(): Promise<VacunaDTO[]> {
    return this.db.vacunas.toArray().then(l => l.filter(v => v.ESTADO_VACUNA === 'ACTIVO').sort((a, b) => a.NOM_VACUNA.localeCompare(b.NOM_VACUNA)));
  }

  //LOS ORDEÑOS ACTIVOS DE UN DIA (AAAA-MM-DD), PARA EL ORDEÑO EN LOTE: QUE VACAS YA SE ORDEÑARON EN CADA JORNADA
  observarOrdenosDelDia(dia: string): Observable<OrdenoDTO[]> {
    const db = this.db;
    return from(liveQuery(async () => (await db.ordenos.toArray()).filter(o => o.ESTADO_ORDENO === 'ACTIVO' && o.FECHA_EVENTO.slice(0, 10) === dia)));
  }

  //EL ULTIMO SERVICIO ACTIVO DEL ANIMAL ANTES DE UNA FECHA Y DESPUES DE SU ULTIMO PARTO (DE AHI SALE EL PADRE DE LA CRIA, COMO EN LA BASE)
  async ultimoServicioAntes(uuid: string, fecha: string): Promise<ServicioDTO | null> {
    const servicios = (await this.db.servicios.where('UUID_ANIMAL').equals(uuid).toArray()).filter(s => s.ESTADO_SERVICIO === 'ACTIVO' && s.FECHA_EVENTO < fecha);
    const partos = (await this.db.partos.where('UUID_ANIMAL').equals(uuid).toArray()).filter(p => p.ESTADO_PARTO === 'ACTIVO' && p.FECHA_EVENTO < fecha);
    const ultimoParto = partos.map(p => p.FECHA_EVENTO).sort().pop() ?? '';
    return servicios.filter(s => s.FECHA_EVENTO > ultimoParto).sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO))[0] ?? null;
  }

  //UN EVENTO POR SU UUID EN SU TABLA (PARA ANULARLO)
  eventoPorUuid(tipo: TipoRegistro, uuid: string): Promise<any> {
    return this.db.table(TABLA_POR_TIPO[tipo].tabla).get(uuid);
  }

  //---------------------------------------------FOTOS GUARDADAS EN EL CELULAR----------------------------------------------------

  //LA FOTO GUARDADA SOLO SIRVE SI ES LA MISMA QUE DICE EL ANIMAL (SI EL DUEÑO LA CAMBIO, archivo YA NO COINCIDE)
  async leerFoto(uuid: string, archivo: string): Promise<Blob | null> {
    const guardada = await this.db.fotos.get(uuid);
    return guardada && guardada.archivo === archivo ? guardada.foto : null;
  }

  guardarFoto(uuid: string, archivo: string, foto: Blob): Promise<string> {
    return this.db.fotos.put({ uuid, archivo, foto });
  }

  borrarFoto(uuid: string): Promise<void> {
    return this.db.fotos.delete(uuid);
  }

  //CUANDO LA FOTO SE SUBE O SE QUITA CON SEÑAL, LA FICHA LOCAL QUEDA AL DIA SIN ESPERAR LA PROXIMA SINCRONIZACION
  actualizarFotoLocal(uuid: string, archivo: string | null): Promise<number> {
    return this.db.animales.update(uuid, { FOTO_ANIMAL: archivo });
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
