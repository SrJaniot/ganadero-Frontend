import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { AnimalDTO, PesajeDTO, RespuestaServerLineaTiempo } from '../Modelos/GanaderoModel';
import { RespuestaServer } from '../Modelos/RespuestaServer.model';
import { AlmacenLocalService } from './almacen-local';
import { SeguridadService } from './seguridad';
import { SincronizacionService } from './sincronizacion.service';

//DATOS DEL FORMULARIO DE UN ANIMAL NUEVO (snake_case: VAN TAL CUAL EN "datos" DE LA BANDEJA, COMO LOS ESPERA LA BASE)
export interface DatosAnimalNuevo {
  chapeta_animal: string | null;
  nom_animal: string | null;
  sexo_animal: 'H' | 'M';
  fecha_nacimiento: string;           //AAAA-MM-DD
  fecha_nacimiento_estimada: 'SI' | 'NO';
  id_raza: number | null;
  uuid_lote: string | null;
  uuid_madre: string | null;
  uuid_padre: string | null;
  padre_externo: string | null;
  origen_animal: 'NACIDO' | 'COMPRADO';
  fecha_ingreso_animal: string | null; //SOLO SI ES COMPRADO
}

export interface DatosPesajeNuevo {
  uuid_animal: string;
  peso_kg: number | null;             //CON CINTA PUEDE IR NULL: LA BASE LO CALCULA CON EL PERIMETRO
  estimado_cinta: 'SI' | 'NO';
  perimetro_cm: number | null;
  fecha_evento: string;               //AAAA-MM-DDTHH:mm (HORA LOCAL)
  observacion: string | null;
}

// EL HATO EN EL CELULAR. REGISTRAR NUNCA NECESITA SEÑAL: SE GUARDA EN DEXIE Y VA A LA BANDEJA (LAS REGLAS LAS VUELVE A REVISAR LA BASE AL SUBIR)
// LAS CUENTAS DE AQUI (CATEGORIA, PESO CON CINTA) SON SOLO PARA MOSTRAR SIN SEÑAL: EL DATO OFICIAL LO CALCULA POSTGRESQL
@Injectable({
  providedIn: 'root'
})
export class HatoService {
  private url = ConfiguracionRutasBackend.url_backend_ms_negocio;

  constructor(
    private http: HttpClient,
    private seguridadService: SeguridadService,
    private almacenLocal: AlmacenLocalService,
    private sincronizacion: SincronizacionService,
  ) { }

  private getHeaders(): HttpHeaders {
    const token = this.seguridadService.ObtenerDatosLocalStorage_TOKEN();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  //---------------------------------------------REGISTRAR (SIN SEÑAL)-----------------------------------------------------------

  //LA FILA LOCAL DEL ANIMAL A PARTIR DEL FORMULARIO (CON LOS NOMBRES DE LOTE, MADRE Y PADRE PARA MOSTRARLOS SIN SEÑAL)
  private async filaAnimal(uuid: string, datos: DatosAnimalNuevo): Promise<AnimalDTO> {
    const chapeta = datos.chapeta_animal?.trim().toUpperCase() || null;
    const lote = datos.uuid_lote ? (await this.almacenLocal.lotes()).find(l => l.UUID_LOTE === datos.uuid_lote) : null;
    const madre = datos.uuid_madre ? await this.almacenLocal.animalPorUuid(datos.uuid_madre) : null;
    const padre = datos.uuid_padre ? await this.almacenLocal.animalPorUuid(datos.uuid_padre) : null;
    return {
      UUID_ANIMAL: uuid,
      UUID_LOTE: datos.uuid_lote,
      NOM_LOTE: lote?.NOM_LOTE ?? null,
      ID_RAZA: datos.id_raza,
      CHAPETA_ANIMAL: chapeta,
      NOM_ANIMAL: datos.nom_animal?.trim() || null,
      SEXO_ANIMAL: datos.sexo_animal,
      FECHA_NACIMIENTO: datos.fecha_nacimiento,
      FECHA_NACIMIENTO_ESTIMADA: datos.fecha_nacimiento_estimada,
      UUID_MADRE: datos.uuid_madre,
      CHAPETA_MADRE: madre?.CHAPETA_ANIMAL ?? null,
      UUID_PADRE: datos.uuid_padre,
      CHAPETA_PADRE: padre?.CHAPETA_ANIMAL ?? null,
      PADRE_EXTERNO: datos.padre_externo,
      ORIGEN_ANIMAL: datos.origen_animal,
      FECHA_INGRESO_ANIMAL: datos.origen_animal === 'NACIDO' ? datos.fecha_nacimiento : (datos.fecha_ingreso_animal ?? datos.fecha_nacimiento),
      PESO_ACTUAL_KG: null,
      FECHA_ULTIMO_PESAJE: null,
      ESTADO_ANIMAL: 'ACTIVO',
    };
  }

  //ANIMAL NUEVO: QUEDA EN EL HATO DEL CELULAR DE INMEDIATO Y SE SUBE CUANDO HAYA SEÑAL. DEVUELVE SU UUID
  async crearAnimal(datos: DatosAnimalNuevo): Promise<string> {
    const uuid = crypto.randomUUID();
    const chapeta = datos.chapeta_animal?.trim().toUpperCase() || null;
    const fila = await this.filaAnimal(uuid, datos);
    const etiqueta = etiquetaAnimal(fila);
    await this.almacenLocal.guardarConBandeja('ANIMAL', fila, {
      uuid, operacion: 'CREAR', datos: { ...datos, chapeta_animal: chapeta }, descripcion: `Animal nuevo: ${etiqueta}`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  //EDITAR LA FICHA (SOLO EL DUEÑO; LA BASE LO VUELVE A REVISAR AL SUBIR). datos LLEVA LA FICHA COMPLETA, COMO AL CREAR
  //NO CAMBIA EL ESTADO NI EL PESO: ESO LO HACEN LA SALIDA, LA ANULACION Y LOS PESAJES
  async editarAnimal(uuid: string, datos: DatosAnimalNuevo): Promise<void> {
    const actual = await this.almacenLocal.animalPorUuid(uuid);
    if (!actual) {
      throw new Error('El animal no está en este celular');
    }
    const chapeta = datos.chapeta_animal?.trim().toUpperCase() || null;
    const { PESO_ACTUAL_KG, FECHA_ULTIMO_PESAJE, ESTADO_ANIMAL, ...cambios } = await this.filaAnimal(uuid, datos);
    await this.almacenLocal.cambiarConBandeja('ANIMAL', uuid, { ...cambios, CATEGORIA_ANIMAL: null }, {
      operacion: 'EDITAR', datos: { ...datos, chapeta_animal: chapeta }, descripcion: `Cambios en la ficha de ${etiquetaAnimal({ ...actual, ...cambios, CATEGORIA_ANIMAL: null })}`,
    });
    this.sincronizacion.programar();
  }

  //ANULAR UN ANIMAL REGISTRADO POR ERROR (SOLO EL DUEÑO). SI SE VENDIO O MURIO, ES UNA SALIDA (FASE 2), NO UNA ANULACION
  //SE REVISA EN EL CELULAR LO MISMO QUE REVISA LA BASE (FUN_ANULAR_ANIMAL_JSON) PARA AVISAR ANTES DE MANDARLO
  async anularAnimal(uuid: string): Promise<void> {
    const animal = await this.almacenLocal.animalPorUuid(uuid);
    if (!animal) {
      throw new Error('El animal no está en este celular');
    }
    const eventos = await this.almacenLocal.contarEventosActivos(uuid);
    if (eventos > 0) {
      throw new Error(`No se puede anular: tiene ${eventos} ${eventos === 1 ? 'registro' : 'registros'} en su línea de tiempo. Si se vendió o murió, registra la salida`);
    }
    const crias = await firstValueFrom(this.almacenLocal.observarCrias(uuid));
    if (crias.length > 0) {
      throw new Error('No se puede anular: es madre o padre de otros animales');
    }
    await this.almacenLocal.cambiarConBandeja('ANIMAL', uuid, { ESTADO_ANIMAL: 'ANULADO' }, {
      operacion: 'ANULAR', datos: {}, descripcion: `Anular ${etiquetaAnimal(animal)}`,
    });
    this.sincronizacion.programar();
  }

  //---------------------------------------------LOTES (SIN SEÑAL)----------------------------------------------------------------

  //EL VAQUERO PUEDE CREAR LOTES; RENOMBRAR Y ANULAR SOLO EL DUEÑO (LO REVISA LA BASE). DEVUELVE EL UUID DEL LOTE
  async crearLote(nombre: string): Promise<string> {
    const uuid = crypto.randomUUID();
    const nom = nombre.trim().replace(/\s+/g, ' ');
    await this.almacenLocal.guardarConBandeja('LOTE', { UUID_LOTE: uuid, NOM_LOTE: nom, ESTADO_LOTE: 'ACTIVO' }, {
      uuid, operacion: 'CREAR', datos: { nom_lote: nom }, descripcion: `Lote nuevo: ${nom}`,
    });
    this.sincronizacion.programar();
    return uuid;
  }

  async renombrarLote(uuid: string, nombre: string): Promise<void> {
    const nom = nombre.trim().replace(/\s+/g, ' ');
    await this.almacenLocal.cambiarConBandeja('LOTE', uuid, { NOM_LOTE: nom }, {
      operacion: 'EDITAR', datos: { nom_lote: nom }, descripcion: `Lote renombrado: ${nom}`,
    });
    this.sincronizacion.programar();
  }

  //SUS ANIMALES QUEDAN SIN LOTE (EN EL CELULAR YA; EN EL SERVIDOR LO HACE FUN_ANULAR_LOTE_JSON)
  async anularLote(uuid: string, nombre: string): Promise<void> {
    await this.almacenLocal.cambiarConBandeja('LOTE', uuid, { ESTADO_LOTE: 'ANULADO' }, {
      operacion: 'ANULAR', datos: {}, descripcion: `Anular el lote ${nombre}`,
    });
    await this.almacenLocal.quitarLoteDeAnimales(uuid);
    this.sincronizacion.programar();
  }

  //PESAJE: EL PESO ACTUAL DEL ANIMAL EN EL CELULAR SE ACTUALIZA YA (EN EL SERVIDOR LO HACE EL TRIGGER TRG_PESO_ACTUAL)
  async registrarPesaje(datos: DatosPesajeNuevo): Promise<string> {
    const uuid = crypto.randomUUID();
    const animal = await this.almacenLocal.animalPorUuid(datos.uuid_animal);
    const pesoMostrar = datos.peso_kg ?? (datos.estimado_cinta === 'SI' ? pesoPorCinta(datos.perimetro_cm) : null);
    const fila: PesajeDTO = {
      UUID_PESAJE: uuid,
      UUID_ANIMAL: datos.uuid_animal,
      FECHA_EVENTO: datos.fecha_evento,
      PESO_KG: pesoMostrar,
      ESTIMADO_CINTA: datos.estimado_cinta,
      PERIMETRO_CM: datos.estimado_cinta === 'SI' ? datos.perimetro_cm : null,
      OBSERVACION_PESAJE: datos.observacion?.trim() || null,
      ESTADO_PESAJE: 'ACTIVO',
    };
    await this.almacenLocal.guardarConBandeja('PESAJE', fila, {
      uuid, operacion: 'CREAR', datos, descripcion: `Pesaje de ${animal ? etiquetaAnimal(animal) : 'un animal'}: ${pesoMostrar ?? '?'} kg${datos.estimado_cinta === 'SI' ? ' (cinta)' : ''}`,
    });
    //PESO ACTUAL DEL ANIMAL EN EL CELULAR SI ESTE ES EL PESAJE MAS RECIENTE
    if (animal && pesoMostrar !== null && (!animal.FECHA_ULTIMO_PESAJE || datos.fecha_evento >= animal.FECHA_ULTIMO_PESAJE.slice(0, 16))) {
      await this.almacenLocal.actualizarPesoLocal(animal.UUID_ANIMAL, pesoMostrar, datos.fecha_evento);
    }
    this.sincronizacion.programar();
    return uuid;
  }

  //---------------------------------------------LECTURAS CON SEÑAL---------------------------------------------------------------

  //---------------------------------------------FOTO DEL ANIMAL (CON SEÑAL)------------------------------------------------------

  //SUBE LA FOTO YA REDUCIDA (reducirImagen). EL ANIMAL DEBE HABER LLEGADO AL SERVIDOR. SOLO EL DUEÑO (LO REVISA LA BASE)
  SubirFotoAnimal(id_finca: number, uuid_animal: string, foto: Blob): Observable<RespuestaServer> {
    const formData = new FormData();
    formData.append('file', foto, 'foto.jpg');
    return this.http.post<RespuestaServer>(this.url + 'SubirFotoAnimal/' + id_finca + '/' + uuid_animal, formData, { headers: this.getHeaders() });
  }

  QuitarFotoAnimal(id_finca: number, uuid_animal: string): Observable<RespuestaServer> {
    return this.http.post<RespuestaServer>(this.url + 'QuitarFotoAnimal/' + id_finca + '/' + uuid_animal, {}, { headers: this.getHeaders() });
  }

  ObtenerFotoAnimal(id_finca: number, uuid_animal: string): Observable<Blob> {
    return this.http.get(this.url + 'ObtenerFotoAnimal/' + id_finca + '/' + uuid_animal, { headers: this.getHeaders(), responseType: 'blob' });
  }

  //DESPUES DE SUBIRLA: LA FICHA LOCAL Y LA COPIA DE LA FOTO QUEDAN AL DIA SIN ESPERAR LA SINCRONIZACION
  async fotoSubida(uuid_animal: string, archivo: string, foto: Blob): Promise<void> {
    await this.almacenLocal.actualizarFotoLocal(uuid_animal, archivo);
    await this.almacenLocal.guardarFoto(uuid_animal, archivo, foto);
  }

  async fotoQuitada(uuid_animal: string): Promise<void> {
    await this.almacenLocal.actualizarFotoLocal(uuid_animal, null);
    await this.almacenLocal.borrarFoto(uuid_animal);
  }

  //LA FOTO PARA MOSTRAR: PRIMERO LA DEL CELULAR; SI NO ESTA Y HAY SEÑAL, SE BAJA Y SE GUARDA. null SI NO TIENE O NO SE PUEDE
  async obtenerFoto(id_finca: number, animal: AnimalDTO): Promise<Blob | null> {
    if (!animal.FOTO_ANIMAL) {
      return null;
    }
    const guardada = await this.almacenLocal.leerFoto(animal.UUID_ANIMAL, animal.FOTO_ANIMAL);
    if (guardada) {
      return guardada;
    }
    if (!navigator.onLine) {
      return null;
    }
    try {
      const foto = await firstValueFrom(this.ObtenerFotoAnimal(id_finca, animal.UUID_ANIMAL));
      await this.almacenLocal.guardarFoto(animal.UUID_ANIMAL, animal.FOTO_ANIMAL, foto);
      return foto;
    } catch {
      return null;
    }
  }

  //LINEA DE TIEMPO OFICIAL (CON TODOS LOS EVENTOS). SIN SEÑAL LA FICHA MUESTRA LO QUE HAY EN EL CELULAR
  ObtenerLineaTiempo(id_finca: number, uuid_animal: string): Observable<RespuestaServerLineaTiempo> {
    return this.http.get<RespuestaServerLineaTiempo>(this.url + 'ObtenerLineaTiempo/' + id_finca + '/' + uuid_animal, { headers: this.getHeaders() });
  }
}

//---------------------------------------------CUENTAS PARA MOSTRAR (IGUALES A LAS DE LA BASE)---------------------------------------

//CATEGORIA DEL ANIMAL, COMO FUN_CATEGORIA_ANIMAL: HEMBRA <12 MESES TERNERA, SIN PARTOS NOVILLA, CON PARTOS VACA;
//MACHO <12 TERNERO, <30 NOVILLO, DESDE 30 TORO. SI LA BASE YA LA MANDO, SE USA LA DE LA BASE
export function categoriaAnimal(animal: Pick<AnimalDTO, 'SEXO_ANIMAL' | 'FECHA_NACIMIENTO' | 'CATEGORIA_ANIMAL'>, tienePartos = false): string {
  if (animal.CATEGORIA_ANIMAL) {
    return animal.CATEGORIA_ANIMAL;
  }
  const meses = mesesCumplidos(animal.FECHA_NACIMIENTO);
  if (animal.SEXO_ANIMAL === 'H') {
    return tienePartos ? 'VACA' : meses < 12 ? 'TERNERA' : 'NOVILLA';
  }
  return meses < 12 ? 'TERNERO' : meses < 30 ? 'NOVILLO' : 'TORO';
}

export function mesesCumplidos(fechaNacimiento: string, hoy = new Date()): number {
  const [a, m, d] = fechaNacimiento.slice(0, 10).split('-').map(Number);
  let meses = (hoy.getFullYear() - a) * 12 + (hoy.getMonth() + 1 - m);
  if (hoy.getDate() < d) {
    meses--;
  }
  return Math.max(meses, 0);
}

//COMO SE NOMBRA UN ANIMAL: "la vaca 23 (Lucero)", "el ternero sin chapeta" (IGUAL QUE FUN_ETIQUETA_ANIMAL)
export function etiquetaAnimal(animal: Pick<AnimalDTO, 'SEXO_ANIMAL' | 'FECHA_NACIMIENTO' | 'CATEGORIA_ANIMAL' | 'CHAPETA_ANIMAL' | 'NOM_ANIMAL'>): string {
  const categoria = categoriaAnimal(animal).toLowerCase();
  const articulo = ['ternera', 'novilla', 'vaca'].includes(categoria) ? 'la' : 'el';
  return `${articulo} ${categoria} ${animal.CHAPETA_ANIMAL ?? 'sin chapeta'}${animal.NOM_ANIMAL ? ' (' + animal.NOM_ANIMAL + ')' : ''}`;
}

//PESO CON CINTA (FORMULA DE QUETELET CON EL COEFICIENTE 80 DE LA CONFIGURACION): KILOS = (PERIMETRO EN METROS)³ × 80
//ES UNA ESTIMACION PARA MOSTRAR: AL SUBIR, LA BASE CALCULA EL PESO CON SU PROPIO COEFICIENTE
export function pesoPorCinta(perimetroCm: number | null | undefined, coeficiente = 80): number | null {
  if (!perimetroCm || perimetroCm <= 0) {
    return null;
  }
  return Math.round(Math.pow(perimetroCm / 100, 3) * coeficiente * 10) / 10;
}

//FECHA Y HORA LOCAL DE AHORA EN EL FORMATO DE FECHA_EVENTO (AAAA-MM-DDTHH:mm)
export function ahoraLocal(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function hoyLocal(): string {
  return ahoraLocal().slice(0, 10);
}

//REDUCE UNA FOTO DEL CELULAR ANTES DE SUBIRLA: LADO MAYOR DE 1280 PX, JPEG CALIDAD 0.8, FONDO BLANCO (COMO LOS COMPROBANTES DE MONSTERHOUSE)
//UNA FOTO DE 4 MB QUEDA EN UNOS 200 KB: SUBE RAPIDO CON POCA SEÑAL Y OCUPA POCO EN EL CELULAR
export function reducirImagen(archivo: File, ladoMaximo = 1280, calidad = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      try {
        const escala = Math.min(1, ladoMaximo / Math.max(imagen.naturalWidth, imagen.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(imagen.naturalHeight * escala));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('sin canvas'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error('sin blob'));
        }, 'image/jpeg', calidad);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Esa no es una foto válida'));
    };
    imagen.src = url;
  });
}
