import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NgToastService } from 'ng-angular-popup';
import { finalize, Subscription } from 'rxjs';
import { DatoBarra } from '../../../../compartido/grafica-barras/grafica-barras';
import { formatearPesos } from '../../../../compartido/pesos.pipe';
import { AnimalDTO, CategoriaMovimiento, MovimientoDTO, PlataGuardada, SalidaDTO, TipoMovimiento } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { ahoraLocal, hoyLocal } from '../../../../servicios/hato.service';
import { CATEGORIAS_POR_TIPO, NOMBRE_CATEGORIA, PlataService } from '../../../../servicios/plata.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';
import { fechaHoraLocalLegible, fechaLegible } from '../hato/hato-vista';

type Periodo = 'MES' | '3' | 'ANIO' | '12';
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

//UNA FILA DE LA LISTA: UN MOVIMIENTO ANOTADO O UNA VENTA DE ANIMAL (ESA SE CORRIGE DESDE LA SALIDA DEL ANIMAL)
interface FilaPlata {
  uuid: string;
  fecha: string;
  tipo: TipoMovimiento;
  titulo: string;
  detalle: string;
  valor: number;
  pendiente: boolean;
  movimiento: MovimientoDTO | null;
  uuidAnimal: string | null;
}

//PLATA DE LA FINCA (FASE 5B, MENU 2: SOLO EL DUEÑO). ANOTAR INGRESOS Y GASTOS SIN SEÑAL; EL RESUMEN LO CALCULA LA BASE Y SE GUARDA EN EL CELULAR
//LA LISTA SALE DE LA COPIA DEL CELULAR (LO ANOTADO SIN SEÑAL SE VE YA, MARCADO); LOS TOTALES SON LOS DE LA ULTIMA CONSULTA AL SERVIDOR
@Component({
  selector: 'app-plata',
  standalone: false,
  templateUrl: './plata.component.html',
})
export class PlataComponent implements OnInit, OnDestroy {
  private plataService = inject(PlataService);
  private almacenLocal = inject(AlmacenLocalService);
  private fincaActual = inject(FincaActualService);
  private seguridadService = inject(SeguridadService);
  private sincronizacion = inject(SincronizacionService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puede = this.seguridadService.tienePermiso(2, 'listar');
  readonly nombreCategoria = NOMBRE_CATEGORIA;
  readonly categoriasPorTipo = CATEGORIAS_POR_TIPO;
  readonly fechaLegible = fechaLegible;
  readonly pesos = formatearPesos;
  readonly hoy = hoyLocal();
  readonly opciones: { valor: Periodo; texto: string }[] = [
    { valor: 'MES', texto: 'Este mes' }, { valor: '3', texto: '3 meses' }, { valor: 'ANIO', texto: 'Este año' }, { valor: '12', texto: '12 meses' },
  ];

  periodo: Periodo = 'MES';
  guardada: PlataGuardada | null = null;
  consultando = false;
  errorConsulta = '';
  estado: EstadoSincronizacion = this.sincronizacion.estado$.value;

  filas: FilaPlata[] = [];
  private movimientos: MovimientoDTO[] = [];
  private ventas: SalidaDTO[] = [];
  private animales: AnimalDTO[] = [];
  gastosPorCategoria: DatoBarra[] = [];
  ingresosPorCategoria: DatoBarra[] = [];

  //ANOTAR
  anotando = false;
  guardando = false;
  tipo: TipoMovimiento = 'GASTO';
  categoria: CategoriaMovimiento | null = null;
  valorTexto = '';
  litrosTexto = '';
  descripcion = '';
  dia = hoyLocal();
  errorAnotar = '';

  porAnular: FilaPlata | null = null;
  anulando = false;
  private subscripciones: Subscription[] = [];

  async ngOnInit(): Promise<void> {
    if (!this.puede) return;
    this.subscripciones.push(
      this.sincronizacion.estado$.subscribe(e => { this.estado = e; this.cd.detectChanges(); }),
      this.almacenLocal.observarPlata().subscribe(({ movimientos, ventas, animales }) => {
        this.movimientos = movimientos;
        this.ventas = ventas;
        this.animales = animales;
        this.armarFilas();
        this.cd.detectChanges();
      }),
    );
    try {
      const g = await this.plataService.leerResumen();
      if (g) {
        this.periodo = (g.periodo as Periodo) ?? 'MES';
        this.mostrar(g);
      }
    } catch { /* SIN COPIA */ }
    this.cd.detectChanges();
    if (this.estado.enLinea) this.consultar();
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  //---------------------------------------------PERIODO Y RESUMEN----------------------------------------------------------------
  private rango(): { desde: string; hasta: string } {
    const h = hoyLocal();
    const [a, m, d] = h.split('-').map(Number);
    const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    switch (this.periodo) {
      case 'MES': return { desde: h.slice(0, 8) + '01', hasta: h };
      case '3': return { desde: f(new Date(a, m - 3, 1)), hasta: h };
      case 'ANIO': return { desde: h.slice(0, 4) + '-01-01', hasta: h };
      default: return { desde: f(new Date(a, m - 1 - 12, d + 1)), hasta: h };
    }
  }

  elegirPeriodo(p: Periodo): void {
    this.periodo = p;
    this.armarFilas();
    this.consultar();
  }

  consultar(): void {
    const finca = this.fincaActual.finca$.value;
    if (!finca) return;
    if (!this.estado.enLinea) {
      this.errorConsulta = 'Sin señal. Los totales son los de la última vez que se calcularon.';
      this.cd.detectChanges();
      return;
    }
    const { desde, hasta } = this.rango();
    this.consultando = true;
    this.errorConsulta = '';
    this.cd.detectChanges();
    this.plataService.ObtenerPlata(finca.idFinca, desde, hasta)
      .pipe(finalize(() => { this.consultando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: async r => {
          if (r.CODIGO === 200 && r.DATOS) {
            const g: PlataGuardada = { plata: r.DATOS, recibida: new Date().toISOString(), periodo: this.periodo };
            this.mostrar(g);
            try { await this.plataService.guardarResumen(g); } catch { /* SOLO ES LA COPIA */ }
          } else {
            this.errorConsulta = r.MENSAJE || 'No se pudo calcular la plata.';
          }
          this.cd.detectChanges();
        },
        error: () => {
          this.errorConsulta = 'No se pudo conectar con el servidor. Los totales son los de la última vez.';
          this.cd.detectChanges();
        },
      });
  }

  private mostrar(g: PlataGuardada): void {
    this.guardada = g;
    const barras = (tipo: TipoMovimiento) => g.plata.POR_CATEGORIA.filter(c => c.TIPO === tipo)
      .map(c => ({ etiqueta: NOMBRE_CATEGORIA[c.CATEGORIA], valor: Number(c.VALOR), detalle: `${NOMBRE_CATEGORIA[c.CATEGORIA]} (${c.CANTIDAD})` }));
    this.gastosPorCategoria = barras('GASTO');
    this.ingresosPorCategoria = barras('INGRESO');
  }

  get p() {
    return this.guardada?.plata ?? null;
  }

  get recibida(): string {
    return this.guardada ? fechaHoraLocalLegible(this.guardada.recibida) : '';
  }

  //EL RESUMEN GUARDADO ES DE OTRO PERIODO (SE ELIGIO OTRO SIN SEÑAL)
  get resumenDeOtroPeriodo(): boolean {
    return !!this.guardada && this.guardada.periodo !== this.periodo;
  }

  get pendientesSinSubir(): number {
    return this.filas.filter(f => f.pendiente).length;
  }

  mesLegible(mes: string): string {
    const [a, n] = mes.split('-').map(Number);
    return `${MESES_LARGOS[n - 1]} ${a}`;
  }

  //---------------------------------------------LA LISTA (COPIA DEL CELULAR)------------------------------------------------------
  private armarFilas(): void {
    const { desde, hasta } = this.rango();
    const enRango = (f: string) => f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta;
    const animal = (uuid: string) => this.animales.find(a => a.UUID_ANIMAL === uuid);
    const filas: FilaPlata[] = [
      ...this.movimientos.filter(m => enRango(m.FECHA_EVENTO)).map(m => ({
        uuid: m.UUID_MOVIMIENTO, fecha: m.FECHA_EVENTO, tipo: m.TIPO_MOVIMIENTO, titulo: NOMBRE_CATEGORIA[m.CATEGORIA_MOVIMIENTO],
        detalle: [m.DESCRIPCION_MOVIMIENTO, m.LITROS_MOVIMIENTO ? `${Number(m.LITROS_MOVIMIENTO).toLocaleString('es-CO')} L` : null].filter(Boolean).join(' · '),
        valor: Number(m.VALOR_MOVIMIENTO), pendiente: !!m._pendiente, movimiento: m, uuidAnimal: null,
      })),
      ...this.ventas.filter(s => enRango(s.FECHA_EVENTO)).map(s => {
        const a = animal(s.UUID_ANIMAL);
        return {
          uuid: s.UUID_SALIDA, fecha: s.FECHA_EVENTO, tipo: 'INGRESO' as TipoMovimiento, titulo: 'Venta de animales',
          detalle: `${a?.CHAPETA_ANIMAL ?? a?.NOM_ANIMAL ?? 'Animal'} · desde la salida`, valor: Number(s.VALOR_SALIDA), pendiente: !!s._pendiente,
          movimiento: null, uuidAnimal: s.UUID_ANIMAL,
        };
      }),
    ];
    this.filas = filas.sort((x, y) => y.fecha.localeCompare(x.fecha));
  }

  //---------------------------------------------ANOTAR---------------------------------------------------------------------------
  abrirAnotar(tipo: TipoMovimiento): void {
    this.anotando = true;
    this.tipo = tipo;
    this.categoria = null;
    this.valorTexto = '';
    this.litrosTexto = '';
    this.descripcion = '';
    this.dia = hoyLocal();
    this.errorAnotar = '';
    this.cd.detectChanges();
  }

  cerrarAnotar(): void {
    if (!this.guardando) {
      this.anotando = false;
      this.cd.detectChanges();
    }
  }

  elegirTipo(t: TipoMovimiento): void {
    this.tipo = t;
    this.categoria = null;
    this.errorAnotar = '';
  }

  //EL VALOR SE ESCRIBE CON PUNTOS DE MILES MIENTRAS SE TECLEA (COMO EN LA SALIDA)
  alEscribirValor(texto: string): void {
    const digitos = (texto ?? '').replace(/\D/g, '').slice(0, 10);
    this.valorTexto = digitos ? Number(digitos).toLocaleString('es-CO') : '';
    this.errorAnotar = '';
  }

  //MISMAS REGLAS QUE FUN_VALIDAR_MOVIMIENTO (LA BASE LAS VUELVE A REVISAR)
  async guardar(): Promise<void> {
    if (this.guardando) return;
    const valor = Number(this.valorTexto.replace(/\D/g, ''));
    const litros = this.litrosTexto.trim() === '' ? null : Number(this.litrosTexto.replace(',', '.'));
    const descripcion = this.descripcion.trim().replace(/\s+/g, ' ') || null;
    this.errorAnotar = !this.categoria ? (this.tipo === 'INGRESO' ? 'Elige de dónde viene el ingreso' : 'Elige en qué fue el gasto')
      : !valor ? 'Escribe el valor en pesos'
      : litros !== null && (!Number.isFinite(litros) || litros <= 0) ? 'Los litros deben ser más de 0'
      : (this.categoria === 'OTRO_INGRESO' || this.categoria === 'OTRO_GASTO') && !descripcion ? 'Escribe qué fue (en «Otro» la descripción es obligatoria)'
      : descripcion && descripcion.length > 200 ? 'La descripción es muy larga (máximo 200 caracteres)'
      : !this.dia ? 'Escribe la fecha' : this.dia > hoyLocal() ? 'La fecha no puede ser futura' : '';
    if (this.errorAnotar) {
      this.cd.detectChanges();
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.plataService.anotar({
        tipo_movimiento: this.tipo, categoria_movimiento: this.categoria!, valor_movimiento: valor,
        litros_movimiento: this.categoria === 'VENTA_LECHE' ? litros : null, descripcion_movimiento: descripcion,
        fecha_evento: this.dia === hoyLocal() ? ahoraLocal() : this.dia + 'T08:00',
      });
      this.toast.success(`Listo: ${this.tipo === 'INGRESO' ? 'ingreso' : 'gasto'} de ${formatearPesos(valor)} anotado. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
      this.anotando = false;
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    }
    this.guardando = false;
    this.cd.detectChanges();
  }

  async anular(): Promise<void> {
    const f = this.porAnular;
    if (!f?.movimiento || this.anulando) return;
    this.anulando = true;
    this.cd.detectChanges();
    try {
      await this.plataService.anular(f.movimiento);
      this.toast.success('Listo: quedó anulado. Se sube cuando haya señal.', 'Éxito', 5000, true, true, true);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    }
    this.anulando = false;
    this.porAnular = null;
    this.cd.detectChanges();
  }
}
