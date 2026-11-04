import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfiguracionRutasBackend } from '../config/configuracion.rutas.backend';
import { AnimalDTO, PesajeDTO, RespuestaServerLineaTiempo } from '../Modelos/GanaderoModel';
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

  //ANIMAL NUEVO: QUEDA EN EL HATO DEL CELULAR DE INMEDIATO Y SE SUBE CUANDO HAYA SEÑAL. DEVUELVE SU UUID
  async crearAnimal(datos: DatosAnimalNuevo): Promise<string> {
    const uuid = crypto.randomUUID();
    const chapeta = datos.chapeta_animal?.trim().toUpperCase() || null;
    const fila: AnimalDTO = {
      UUID_ANIMAL: uuid,
      UUID_LOTE: datos.uuid_lote,
      ID_RAZA: datos.id_raza,
      CHAPETA_ANIMAL: chapeta,
      NOM_ANIMAL: datos.nom_animal?.trim() || null,
      SEXO_ANIMAL: datos.sexo_animal,
      FECHA_NACIMIENTO: datos.fecha_nacimiento,
      FECHA_NACIMIENTO_ESTIMADA: datos.fecha_nacimiento_estimada,
      UUID_MADRE: datos.uuid_madre,
      UUID_PADRE: datos.uuid_padre,
      PADRE_EXTERNO: datos.padre_externo,
      ORIGEN_ANIMAL: datos.origen_animal,
      FECHA_INGRESO_ANIMAL: datos.origen_animal === 'NACIDO' ? datos.fecha_nacimiento : (datos.fecha_ingreso_animal ?? datos.fecha_nacimiento),
      PESO_ACTUAL_KG: null,
      FECHA_ULTIMO_PESAJE: null,
      ESTADO_ANIMAL: 'ACTIVO',
    };
    const etiqueta = etiquetaAnimal(fila);
    await this.almacenLocal.guardarConBandeja('ANIMAL', fila, {
      uuid, operacion: 'CREAR', datos: { ...datos, chapeta_animal: chapeta }, descripcion: `Animal nuevo: ${etiqueta}`,
    });
    this.sincronizacion.programar();
    return uuid;
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
