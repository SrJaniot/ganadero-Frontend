import { Pipe, PipeTransform } from '@angular/core';

const FORMATO_PESOS = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, minimumFractionDigits: 0 });

//PESOS COLOMBIANOS SIN DECIMALES: 550000 -> "$ 550.000". USO: {{ valor | pesos }}
@Pipe({
  name: 'pesos',
  standalone: false,
})
export class PesosPipe implements PipeTransform {
  transform(valor: number | string | null | undefined): string {
    return formatearPesos(valor);
  }
}

export function formatearPesos(valor: number | string | null | undefined): string {
  const n = Math.round(Number(valor ?? 0));
  if (!Number.isFinite(n)) {
    return '$ 0';
  }
  return (n < 0 ? '-$ ' : '$ ') + FORMATO_PESOS.format(Math.abs(n));
}
