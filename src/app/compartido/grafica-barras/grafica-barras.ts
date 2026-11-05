import { Component, Input } from '@angular/core';

//UN DATO DE LA GRAFICA: etiqueta CORTA PARA EL EJE ("oct"), detalle PARA LA ETIQUETA Y LA TABLA ("octubre 2026")
export interface DatoBarra {
  etiqueta: string;
  valor: number;
  detalle?: string;
}

//GRAFICA DE BARRAS EN SVG HECHO A MANO (PLAN, FASE 4). UNA SOLA SERIE, UN SOLO COLOR (EL VERDE DE LA MARCA) Y UNA SOLA ESCALA
//REGLAS (SKILL DATAVIZ): BARRAS DE MAXIMO 24 PX CON EL EXTREMO REDONDEADO DE 4 PX Y RECTAS EN LA BASE; REJILLA TENUE; EL TEXTO VA EN TINTA,
//NUNCA EN EL COLOR DE LA BARRA; VALORES SOLO EN LA MAS ALTA Y EN LA ULTIMA (COLUMNAS) O EN TODAS SI SON POCAS (HORIZONTAL);
//ETIQUETA AL TOCAR O PASAR (AREA TACTIL MAS GRANDE QUE LA BARRA) Y "VER LA TABLA" PARA TENER TODOS LOS NUMEROS SIN DEPENDER DEL COLOR
//USO: <app-grafica-barras [datos]="lista" unidad="L" titulo="Litros por mes" [horizontal]="false" />
@Component({
  selector: 'app-grafica-barras',
  standalone: false,
  templateUrl: './grafica-barras.html',
})
export class GraficaBarras {
  @Input() datos: DatoBarra[] = [];
  @Input() titulo = '';
  @Input() unidad = '';
  @Input() horizontal = false;
  @Input() decimales = 0;
  @Input() prefijo = '';

  activo: number | null = null;
  verTabla = false;

  //MEDIDAS DEL DIBUJO (EL SVG SE ESCALA AL ANCHO DE LA TARJETA CON viewBox)
  readonly ancho = 340;
  readonly altoColumnas = 190;
  readonly margenIzq = 8;
  readonly margenAbajo = 26;
  readonly margenArriba = 22;
  readonly filaHorizontal = 40;
  //ANCHO PARA LOS NOMBRES EN LAS BARRAS HORIZONTALES (LOS NOMBRES LARGOS, COMO LAS CATEGORIAS DE LA PLATA, PIDEN MAS)
  @Input() etiquetaHorizontal = 90;

  get maximo(): number {
    const m = Math.max(0, ...this.datos.map(d => d.valor));
    return m > 0 ? m : 1;
  }

  //UN TOPE "REDONDO" PARA LA ESCALA (1, 2, 5 × 10^n) Y TRES LINEAS DE REJILLA
  get tope(): number {
    const m = this.maximo;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const n = m / p;
    const tope = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    //CON NUMEROS ENTEROS (PARTOS) LA LINEA DE LA MITAD TAMBIEN DEBE SER ENTERA
    return this.decimales === 0 && tope < 2 ? 2 : tope;
  }

  get lineas(): number[] {
    return [0.5, 1].map(f => f * this.tope);
  }

  fmt(v: number): string {
    return this.prefijo + v.toLocaleString('es-CO', { minimumFractionDigits: this.decimales, maximumFractionDigits: this.decimales });
  }

  //---------------------------------------------COLUMNAS (VERTICAL)-----------------------------------------------------------------
  get banda(): number {
    return (this.ancho - this.margenIzq) / Math.max(this.datos.length, 1);
  }

  get grosor(): number {
    return Math.min(24, this.banda - 2);
  }

  get altoPlot(): number {
    return this.altoColumnas - this.margenAbajo - this.margenArriba;
  }

  xColumna(i: number): number {
    return this.margenIzq + i * this.banda + (this.banda - this.grosor) / 2;
  }

  altoColumna(v: number): number {
    return Math.max(v > 0 ? 2 : 0, (v / this.tope) * this.altoPlot);
  }

  yBase(): number {
    return this.altoColumnas - this.margenAbajo;
  }

  yLinea(v: number): number {
    return this.yBase() - (v / this.tope) * this.altoPlot;
  }

  //CAMINO DE UNA COLUMNA: RECTA EN LA BASE, ESQUINAS DE 4 PX ARRIBA
  caminoColumna(i: number): string {
    const v = this.datos[i].valor;
    const h = this.altoColumna(v);
    if (h <= 0) return '';
    const x = this.xColumna(i), w = this.grosor, y = this.yBase() - h, r = Math.min(4, h, w / 2);
    return `M${x},${this.yBase()} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${this.yBase()} Z`;
  }

  //SOLO LA MAS ALTA Y LA ULTIMA LLEVAN EL VALOR ESCRITO (LAS DEMAS, AL TOCAR O EN LA TABLA)
  conValor(i: number): boolean {
    if (this.activo !== null) return i === this.activo;
    const iMax = this.datos.reduce((m, d, k, l) => (d.valor > l[m].valor ? k : m), 0);
    return i === iMax || i === this.datos.length - 1;
  }

  //CADA CUANTAS COLUMNAS SE ESCRIBE LA ETIQUETA DEL EJE PARA QUE NO SE MONTEN
  get pasoEtiquetas(): number {
    return Math.max(1, Math.ceil(this.datos.length / 8));
  }

  //---------------------------------------------BARRAS (HORIZONTAL)-----------------------------------------------------------------
  //CUANTAS LETRAS CABEN EN LA ZONA DEL NOMBRE (A 13 PX, UNOS 7 PX POR LETRA)
  get letrasEtiqueta(): number {
    return Math.floor(this.etiquetaHorizontal / 7);
  }

  etiquetaCorta(texto: string): string {
    return texto.length > this.letrasEtiqueta ? texto.slice(0, this.letrasEtiqueta - 1) + '…' : texto;
  }

  get altoHorizontal(): number {
    return this.datos.length * this.filaHorizontal + 6;
  }

  get anchoPlotHorizontal(): number {
    return this.ancho - this.etiquetaHorizontal - 96;
  }

  largoBarra(v: number): number {
    return Math.max(v > 0 ? 2 : 0, (v / this.maximo) * this.anchoPlotHorizontal);
  }

  //CAMINO DE UNA BARRA HORIZONTAL: RECTA EN LA BASE (IZQUIERDA), ESQUINAS DE 4 PX EN LA PUNTA
  caminoBarra(i: number): string {
    const v = this.datos[i].valor;
    const w = this.largoBarra(v);
    if (w <= 0) return '';
    const x = this.etiquetaHorizontal, h = 22, y = i * this.filaHorizontal + (this.filaHorizontal - h) / 2, r = Math.min(4, w, h / 2);
    return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
  }

  //---------------------------------------------ETIQUETA AL TOCAR---------------------------------------------------------------------
  tocar(i: number): void {
    this.activo = this.activo === i ? null : i;
  }

  get textoActivo(): string {
    if (this.activo === null) return '';
    const d = this.datos[this.activo];
    return `${this.fmt(d.valor)}${this.unidad ? ' ' + this.unidad : ''} · ${d.detalle ?? d.etiqueta}`;
  }
}
