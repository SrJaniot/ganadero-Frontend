import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NgToastService } from 'ng-angular-popup';
import { finalize, Subscription } from 'rxjs';
import { DatoBarra } from '../../../../compartido/grafica-barras/grafica-barras';
import { formatearPesos } from '../../../../compartido/pesos.pipe';
import { IndicadoresDTO, IndicadoresGuardados } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { descargarExcelFinca } from '../../../../servicios/excel-finca';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { hoyLocal } from '../../../../servicios/hato.service';
import { IndicadoresService } from '../../../../servicios/indicadores.service';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';
import { fechaHoraLocalLegible, fechaLegible } from '../hato/hato-vista';

type Periodo = '3' | '6' | '12' | 'ANIO' | 'OTRO';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CATEGORIAS: Record<string, string> = { VACA: 'Vacas', NOVILLA: 'Novillas', TERNERA: 'Terneras', TORO: 'Toros', NOVILLO: 'Novillos', TERNERO: 'Terneros' };

//INDICADORES Y EXCEL (MENU 6, DUEÑO Y VETERINARIO): COMO VA LA FINCA EN UN PERIODO
//LOS NUMEROS LOS CALCULA LA BASE (FUN_OBTENER_INDICADORES_JSON) CON LO QUE YA SUBIO; EL CELULAR GUARDA LA ULTIMA CONSULTA PARA VERLA SIN SEÑAL
//EL EXCEL SE ARMA EN EL CELULAR CON LA COPIA LOCAL (TODO EL HISTORIAL) MAS ESOS INDICADORES
@Component({
  selector: 'app-indicadores',
  standalone: false,
  templateUrl: './indicadores.component.html',
})
export class IndicadoresComponent implements OnInit, OnDestroy {
  private indicadoresService = inject(IndicadoresService);
  private almacenLocal = inject(AlmacenLocalService);
  private fincaActual = inject(FincaActualService);
  private sincronizacion = inject(SincronizacionService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  periodo: Periodo = '12';
  desde = '';
  hasta = '';
  errorPeriodo = '';

  guardados: IndicadoresGuardados | null = null;
  cargando = true;
  consultando = false;
  errorConsulta = '';
  generandoExcel = false;
  estado: EstadoSincronizacion = this.sincronizacion.estado$.value;
  private subscripciones: Subscription[] = [];

  readonly fechaLegible = fechaLegible;
  readonly opciones: { valor: Periodo; texto: string }[] = [
    { valor: '3', texto: '3 meses' }, { valor: '6', texto: '6 meses' }, { valor: '12', texto: '12 meses' },
    { valor: 'ANIO', texto: 'Este año' }, { valor: 'OTRO', texto: 'Otras fechas' },
  ];

  //LAS SERIES DE LAS GRAFICAS (SE ARMAN AL RECIBIR LOS DATOS, NO EN CADA DIBUJO)
  lechePorMes: DatoBarra[] = [];
  partosPorMes: DatoBarra[] = [];
  gananciaPorLote: DatoBarra[] = [];
  hatoPorCategoria: DatoBarra[] = [];

  async ngOnInit(): Promise<void> {
    this.subscripciones.push(this.sincronizacion.estado$.subscribe(e => { this.estado = e; this.cd.detectChanges(); }));
    this.hasta = hoyLocal();
    this.desde = this.restarMeses(12);
    try {
      const guardados = await this.indicadoresService.leerGuardados();
      if (guardados) {
        this.periodo = (guardados.periodo as Periodo) ?? '12';
        this.mostrar(guardados);
        if (this.periodo === 'OTRO') {
          this.desde = guardados.indicadores.DESDE;
          this.hasta = guardados.indicadores.HASTA;
        }
      }
    } catch { /* SIN COPIA: SE CONSULTA */ }
    this.cargando = false;
    this.cd.detectChanges();
    if (this.estado.enLinea) {
      this.consultar();
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  get i(): IndicadoresDTO | null {
    return this.guardados?.indicadores ?? null;
  }

  get recibidas(): string {
    return this.guardados ? fechaHoraLocalLegible(this.guardados.recibidas) : '';
  }

  //---------------------------------------------PERIODO--------------------------------------------------------------------------
  private restarMeses(meses: number): string {
    const [a, m, d] = hoyLocal().split('-').map(Number);
    const f = new Date(a, m - 1 - meses, d + 1);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }

  elegirPeriodo(p: Periodo): void {
    this.periodo = p;
    this.errorPeriodo = '';
    if (p !== 'OTRO') {
      this.consultar();
    }
    this.cd.detectChanges();
  }

  //LAS FECHAS QUE SE MANDAN; LA BASE VALIDA LO DEMAS (MAXIMO 3 AÑOS, DESDE ANTES DE HASTA)
  private fechas(): { desde: string | null; hasta: string | null } | null {
    const hoy = hoyLocal();
    switch (this.periodo) {
      case '3': return { desde: this.restarMeses(3), hasta: hoy };
      case '6': return { desde: this.restarMeses(6), hasta: hoy };
      case '12': return { desde: null, hasta: null };
      case 'ANIO': return { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy };
      default:
        if (!this.desde || !this.hasta) {
          this.errorPeriodo = 'Escribe las dos fechas.';
          return null;
        }
        if (this.desde > this.hasta) {
          this.errorPeriodo = 'La fecha de inicio debe ser antes de la fecha final.';
          return null;
        }
        return { desde: this.desde, hasta: this.hasta };
    }
  }

  consultar(): void {
    const finca = this.fincaActual.finca$.value;
    const f = this.fechas();
    if (!finca || !f) {
      this.cd.detectChanges();
      return;
    }
    if (!this.estado.enLinea) {
      this.errorConsulta = 'Sin señal. Se muestran los últimos indicadores que se calcularon.';
      this.cd.detectChanges();
      return;
    }
    this.consultando = true;
    this.errorConsulta = '';
    this.cd.detectChanges();
    this.indicadoresService.ObtenerIndicadores(finca.idFinca, f.desde, f.hasta)
      .pipe(finalize(() => { this.consultando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: async respuesta => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            const guardados: IndicadoresGuardados = { indicadores: respuesta.DATOS, recibidas: new Date().toISOString(), periodo: this.periodo };
            this.mostrar(guardados);
            try { await this.indicadoresService.guardar(guardados); } catch { /* SOLO ES LA COPIA */ }
          } else if (this.periodo === 'OTRO' && respuesta.CODIGO === 400) {
            this.errorPeriodo = respuesta.MENSAJE ?? 'Revisa las fechas.';
          } else {
            this.errorConsulta = respuesta.MENSAJE || 'No se pudieron calcular los indicadores.';
          }
          this.cd.detectChanges();
        },
        error: () => {
          this.errorConsulta = 'No se pudo conectar con el servidor. Se muestran los últimos indicadores que se calcularon.';
          this.cd.detectChanges();
        },
      });
  }

  //---------------------------------------------DATOS PARA LA PANTALLA------------------------------------------------------------
  private mostrar(g: IndicadoresGuardados): void {
    this.guardados = g;
    const i = g.indicadores;
    const mes = (m: string) => {
      const [a, n] = m.split('-').map(Number);
      return { etiqueta: MESES[n - 1], detalle: `${MESES_LARGOS[n - 1]} ${a}` };
    };
    this.lechePorMes = i.LECHE.POR_MES.map(x => ({ ...mes(x.MES), valor: Number(x.LITROS) }));
    this.partosPorMes = i.PARTOS_POR_MES.map(x => ({ ...mes(x.MES), valor: Number(x.PARTOS) }));
    this.gananciaPorLote = i.GANANCIA_PESO.POR_LOTE.map(x => ({
      etiqueta: x.NOM_LOTE, valor: Number(x.GRAMOS_DIA ?? 0), detalle: `${x.NOM_LOTE} (${x.ANIMALES} ${x.ANIMALES === 1 ? 'animal' : 'animales'})`,
    }));
    this.hatoPorCategoria = i.HATO_POR_CATEGORIA.map(x => ({ etiqueta: CATEGORIAS[x.CATEGORIA] ?? x.CATEGORIA, valor: Number(x.CANTIDAD) }));
  }

  //UN NUMERO CON COMA DECIMAL O "—" SI NO HAY CON QUE CALCULARLO
  //minimo: DECIMALES QUE SIEMPRE SE ESCRIBEN (LOS PORCENTAJES LLEVAN UNO; UN TOTAL DE LITROS SOLO SI NO ES ENTERO)
  n(v: number | null | undefined, decimales = 0, minimo = decimales): string {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('es-CO', { minimumFractionDigits: minimo, maximumFractionDigits: decimales });
  }

  get partosEnPeriodo(): number {
    return this.i ? this.i.PARTOS_POR_MES.reduce((s, x) => s + Number(x.PARTOS), 0) : 0;
  }

  get totalHato(): number {
    return this.i ? this.i.HATO_POR_CATEGORIA.reduce((s, x) => s + Number(x.CANTIDAD), 0) : 0;
  }

  get valorVentas(): string {
    return formatearPesos(this.i?.VENTAS.VALOR_TOTAL ?? 0);
  }

  //---------------------------------------------EXCEL-----------------------------------------------------------------------------
  async descargarExcel(): Promise<void> {
    const finca = this.fincaActual.finca$.value;
    if (!finca || this.generandoExcel) return;
    this.generandoExcel = true;
    this.cd.detectChanges();
    try {
      const archivo = await descargarExcelFinca(this.almacenLocal, finca.nombre, this.i);
      this.toast.success(`Se descargó ${archivo}`, 'Éxito', 5000, true, true, true);
    } catch {
      this.toast.danger('No se pudo armar el Excel. Inténtalo de nuevo.', 'Error', 5000, true, true, true);
    } finally {
      this.generandoExcel = false;
      this.cd.detectChanges();
    }
  }
}
