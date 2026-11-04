import { AnimalDTO, PartoDTO } from '../../../../Modelos/GanaderoModel';
import { ahoraLocal, etiquetaAnimal, mesesCumplidos } from '../../../../servicios/hato.service';

// REGLAS COMUNES DE LOS EVENTOS DE MONTA, PALPACION Y PARTO (LAS MISMAS DE LA BASE, CON LOS MISMOS MENSAJES)
// SOLO SIRVEN PARA AVISAR EN EL POTRERO: AL SUBIR, LA BASE LAS VUELVE A REVISAR

//"2026-11-04..." -> "04/11/2026" (COMO to_char(..., 'DD/MM/YYYY') EN LOS MENSAJES DE LA BASE)
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

//"la vaca 23" -> "La vaca 23" (COMO upper(left(FUN_ETIQUETA_ANIMAL(...), 1)) EN LA BASE)
export function etiquetaMayuscula(animal: AnimalDTO): string {
  const texto = etiquetaAnimal(animal);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

//SUMA MESES A UNA FECHA AAAA-MM-DD (PARA EL PARTO APROXIMADO DE UNA PALPACION)
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + meses, d)).toISOString().slice(0, 10);
}

//LA FECHA DEL EVENTO COMO Date LOCAL (PARA CONTAR MESES CUMPLIDOS EN ESA FECHA)
function dateLocal(fecha: string): Date {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

//MESES CUMPLIDOS DEL ANIMAL EN LA FECHA DEL EVENTO
export function mesesEnFecha(animal: AnimalDTO, fecha: string): number {
  return mesesCumplidos(animal.FECHA_NACIMIENTO, dateLocal(fecha));
}

//COMO FUN_CATEGORIA_ANIMAL(ID, FECHA) PARA UNA HEMBRA: ¿ERA TERNERA EN ESA FECHA? (CON UN PARTO ANTES YA ES VACA)
export function eraTernera(animal: AnimalDTO, fecha: string, partos: PartoDTO[]): boolean {
  const dia = fecha.slice(0, 10);
  const partosAntes = partos.filter(p => p.ESTADO_PARTO === 'ACTIVO' && p.FECHA_EVENTO.slice(0, 10) <= dia).length;
  return partosAntes === 0 && mesesEnFecha(animal, fecha) < 12;
}

//LO COMUN A TODOS LOS EVENTOS (FUN_VALIDAR_EVENTO_ANIMAL): FECHA, NO FUTURA, NO ANTES DEL NACIMIENTO, NO DESPUES DE LA SALIDA
export function validarFechaEvento(animal: AnimalDTO | null, fecha: string): string | null {
  if (!fecha) {
    return 'Falta la fecha';
  }
  if (fecha > ahoraLocal()) {
    return 'La fecha no puede ser futura';
  }
  if (animal && fecha.slice(0, 10) < animal.FECHA_NACIMIENTO.slice(0, 10)) {
    return `La fecha es anterior al nacimiento de ${etiquetaAnimal(animal)} (${fechaCorta(animal.FECHA_NACIMIENTO)})`;
  }
  if (animal && animal.FECHA_SALIDA_ANIMAL && fecha > animal.FECHA_SALIDA_ANIMAL) {
    const como = animal.ESTADO_ANIMAL === 'VENDIDO' ? ' se vendió' : animal.ESTADO_ANIMAL === 'MUERTO' ? ' murió' : ' salió de la finca';
    return `${etiquetaMayuscula(animal)}${como} el ${fechaCorta(animal.FECHA_SALIDA_ANIMAL)}: no se le pueden registrar cosas después de esa fecha`;
  }
  return null;
}
