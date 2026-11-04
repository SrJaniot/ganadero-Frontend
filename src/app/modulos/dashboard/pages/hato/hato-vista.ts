import { AnimalDTO } from '../../../../Modelos/GanaderoModel';
import { categoriaAnimal, mesesCumplidos } from '../../../../servicios/hato.service';

// AYUDAS PARA MOSTRAR EL HATO EN PANTALLA (LAS USAN LA LISTA, LA FICHA, ANIMAL NUEVO Y PESE). SOLO FORMATO: NO CAMBIAN DATOS

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

//VIEWMODEL DE UN ANIMAL PARA LAS TARJETAS
export interface AnimalVista {
  uuid: string;
  chapeta: string | null;
  nombre: string | null;
  sexo: 'H' | 'M';
  categoria: string;
  edad: string;
  peso: number | null;
  fechaPeso: string | null;
  pendiente: boolean;
  estado: string;
  uuidLote: string | null;
  lote: string | null;
  textoBusqueda: string;
}

export function aVista(a: AnimalDTO): AnimalVista {
  const peso = a.PESO_ACTUAL_KG === null || a.PESO_ACTUAL_KG === undefined || a.PESO_ACTUAL_KG === '' ? null : Number(a.PESO_ACTUAL_KG);
  return {
    uuid: a.UUID_ANIMAL,
    chapeta: a.CHAPETA_ANIMAL,
    nombre: a.NOM_ANIMAL,
    sexo: a.SEXO_ANIMAL,
    categoria: nombreCategoria(categoriaAnimal(a)),
    edad: edadLegible(a.FECHA_NACIMIENTO, a.FECHA_NACIMIENTO_ESTIMADA === 'SI'),
    peso: peso !== null && !isNaN(peso) ? peso : null,
    fechaPeso: a.FECHA_ULTIMO_PESAJE ? fechaLegible(a.FECHA_ULTIMO_PESAJE) : null,
    pendiente: !!a._pendiente,
    estado: a.ESTADO_ANIMAL,
    uuidLote: a.UUID_LOTE,
    lote: a.UUID_LOTE ? (a.NOM_LOTE ?? null) : null,
    textoBusqueda: `${a.CHAPETA_ANIMAL ?? ''} ${a.NOM_ANIMAL ?? ''}`.toLowerCase(),
  };
}

//"TERNERA" -> "Ternera"
export function nombreCategoria(categoria: string): string {
  const texto = (categoria || '').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

//EDAD EN PALABRAS: "2 años y 3 meses", "5 meses", "menos de un mes". SI LA FECHA ES APROXIMADA: "unos 2 años"
export function edadLegible(fechaNacimiento: string | null | undefined, aproximada = false): string {
  if (!fechaNacimiento) {
    return '';
  }
  const meses = mesesCumplidos(fechaNacimiento);
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  let texto: string;
  if (meses === 0) {
    texto = 'menos de un mes';
  } else if (anios === 0) {
    texto = `${resto} ${resto === 1 ? 'mes' : 'meses'}`;
  } else {
    texto = `${anios} ${anios === 1 ? 'año' : 'años'}` + (resto ? ` y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : '');
  }
  return aproximada && meses > 0 ? 'unos ' + texto : texto;
}

//"2026-11-04" -> "4 nov 2026"; "2026-11-04T07:40" -> "4 nov 2026, 7:40 a. m."
export function fechaLegible(fecha: string | null | undefined, conHora = false): string {
  if (!fecha) {
    return '';
  }
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) {
    return fecha;
  }
  let texto = `${d} ${MESES_CORTOS[m - 1]} ${a}`;
  if (conHora && fecha.length >= 16) {
    const h = Number(fecha.slice(11, 13));
    const min = fecha.slice(14, 16);
    texto += `, ${h % 12 === 0 ? 12 : h % 12}:${min} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  }
  return texto;
}

//FECHA ISO CON ZONA (2026-11-04T12:40:00Z) A HORA LOCAL LEGIBLE
export function fechaHoraLocalLegible(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso;
  }
  const dos = (n: number) => String(n).padStart(2, '0');
  return fechaLegible(`${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`, true);
}

//ORDEN POR CHAPETA: LOS NUMEROS COMO NUMEROS (2 ANTES DE 10), LUEGO LOS SIN CHAPETA POR NOMBRE
export function compararPorChapeta(a: { chapeta: string | null; nombre: string | null }, b: { chapeta: string | null; nombre: string | null }): number {
  if (a.chapeta && b.chapeta) {
    return a.chapeta.localeCompare(b.chapeta, 'es', { numeric: true, sensitivity: 'base' });
  }
  if (a.chapeta) {
    return -1;
  }
  if (b.chapeta) {
    return 1;
  }
  return (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es');
}

export function nombreSexo(sexo: 'H' | 'M'): string {
  return sexo === 'H' ? 'Hembra' : 'Macho';
}

export function nombreEstado(estado: string): string {
  return ({ ACTIVO: 'En la finca', VENDIDO: 'Vendido', MUERTO: 'Murió', TRASLADADO: 'Trasladado', ANULADO: 'Anulado' } as Record<string, string>)[estado] ?? estado;
}

//"2026-11-04" DE LA FECHA LOCAL DE UN Date
export function fechaLocalDe(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
