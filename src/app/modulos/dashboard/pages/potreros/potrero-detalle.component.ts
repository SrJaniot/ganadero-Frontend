import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { LoteDTO, OcupacionDTO, PotreroDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { hoyLocal } from '../../../../servicios/hato.service';
import { diasEntre, EstadoHoyPotrero, estadoPotrero, PotrerosService } from '../../../../servicios/potreros.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { fechaLegible } from '../hato/hato-vista';
import { ContornoVecino } from './mapa-potrero.component';

//UNA FILA DEL HISTORIAL DEL POTRERO
interface MovimientoVista {
  ocupacion: OcupacionDTO;
  nomLote: string;
  entrada: string;
  salida: string | null;
  dias: number;
  esUltimoDelLote: boolean;
  pendiente: boolean;
}

//FICHA DE UN POTRERO: ESTADO DE HOY, MAPA (SI TIENE CONTORNO), Y LA HISTORIA DE LOS LOTES QUE HAN PASADO POR EL
//EL DUEÑO EDITA, ANULA EL POTRERO Y ANULA EL ULTIMO MOVIMIENTO DE UN LOTE (PARA CORREGIR UN ERROR)
@Component({
  selector: 'app-potrero-detalle',
  standalone: false,
  templateUrl: './potrero-detalle.component.html',
})
export class PotreroDetalleComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private potrerosService = inject(PotrerosService);
  private fincaActual = inject(FincaActualService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  uuid = this.route.snapshot.paramMap.get('uuid')!;
  cargando = true;
  potrero: PotreroDTO | null = null;
  hoy: EstadoHoyPotrero | null = null;
  historial: MovimientoVista[] = [];
  vecinos: ContornoVecino[] = [];
  esDuenio = this.fincaActual.esDuenio;
  puedeMover = this.seguridadService.tienePermiso(3, 'guardar');
  readonly fechaLegible = fechaLegible;

  porAnularMovimiento: MovimientoVista | null = null;
  porAnularPotrero = false;
  procesando = false;
  private subscripcion: Subscription | null = null;

  ngOnInit(): void {
    this.subscripcion = this.almacenLocal.observarPotreros().subscribe(({ potreros, ocupaciones, lotes }) => {
      this.potrero = potreros.find(p => p.UUID_POTRERO === this.uuid) ?? null;
      this.vecinos = potreros.filter(p => p.UUID_POTRERO !== this.uuid && p.CONTORNO_POTRERO?.length)
        .map(p => ({ nombre: p.NOM_POTRERO, contorno: p.CONTORNO_POTRERO! }));
      if (this.potrero) {
        this.hoy = estadoPotrero(this.potrero, ocupaciones, lotes);
        this.historial = this.armarHistorial(ocupaciones, lotes);
      }
      this.cargando = false;
      this.cd.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.subscripcion?.unsubscribe();
  }

  private armarHistorial(ocupaciones: OcupacionDTO[], lotes: (LoteDTO & { _pendiente?: boolean })[]): MovimientoVista[] {
    const hoy = hoyLocal();
    //EL ULTIMO MOVIMIENTO DE CADA LOTE (EN CUALQUIER POTRERO): SOLO ESE SE PUEDE ANULAR, COMO EN LA BASE
    //CON LA MISMA HORA DE ENTRADA (DOS MOVIMIENTOS EN EL MISMO MINUTO) EL ULTIMO ES EL QUE SIGUE ABIERTO O SALIO DESPUES
    const clave = (o: OcupacionDTO) => o.FECHA_EVENTO.slice(0, 16) + '|' + (o.FECHA_SALIDA_OCUPACION?.slice(0, 16) ?? '9999');
    const ultimo = new Map<string, OcupacionDTO>();
    for (const o of ocupaciones) {
      const actual = ultimo.get(o.UUID_LOTE);
      if (!actual || clave(o) > clave(actual)) {
        ultimo.set(o.UUID_LOTE, o);
      }
    }
    return ocupaciones.filter(o => o.UUID_POTRERO === this.uuid)
      .sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO))
      .map(o => ({
        ocupacion: o,
        nomLote: lotes.find(l => l.UUID_LOTE === o.UUID_LOTE)?.NOM_LOTE ?? 'Lote anulado',
        entrada: o.FECHA_EVENTO,
        salida: o.FECHA_SALIDA_OCUPACION,
        dias: diasEntre(o.FECHA_EVENTO, o.FECHA_SALIDA_OCUPACION ?? hoy),
        esUltimoDelLote: ultimo.get(o.UUID_LOTE)?.UUID_OCUPACION === o.UUID_OCUPACION,
        pendiente: !!o._pendiente,
      }));
  }

  get textoEstado(): string {
    const h = this.hoy, p = this.potrero;
    if (!h || !p) return '';
    switch (h.estado) {
      case 'OCUPADO': return `Ocupado hace ${h.diasOcupado} ${h.diasOcupado === 1 ? 'día' : 'días'}`;
      case 'LISTO': return `Listo para entrar: descansó ${h.diasDescanso} días (necesita ${p.DIAS_DESCANSO_POTRERO})`;
      case 'DESCANSANDO': return `Descansando: ${h.diasDescanso} de ${p.DIAS_DESCANSO_POTRERO} días. Faltan ${Number(p.DIAS_DESCANSO_POTRERO) - h.diasDescanso!}`;
      default: return `Sin uso registrado. Necesita ${p.DIAS_DESCANSO_POTRERO} días de descanso entre lote y lote`;
    }
  }

  get nombresLotes(): string {
    return (this.hoy?.lotes ?? []).map(l => l.nomLote).join(', ');
  }

  get area(): string {
    return this.potrero?.AREA_POTRERO ? Number(this.potrero.AREA_POTRERO).toLocaleString('es-CO') + ' ha' : 'Sin área';
  }

  async anularMovimiento(): Promise<void> {
    const m = this.porAnularMovimiento;
    if (!m || this.procesando) return;
    this.procesando = true;
    this.cd.detectChanges();
    try {
      await this.potrerosService.anularMovimiento(m.ocupacion, `Anular: el lote ${m.nomLote} entró a ${this.potrero?.NOM_POTRERO}`);
      this.toast.success('Listo: el movimiento quedó anulado y el lote volvió a donde estaba. Se sube cuando haya señal.', 'Éxito', 5000, true, true, true);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    }
    this.procesando = false;
    this.porAnularMovimiento = null;
    this.cd.detectChanges();
  }

  async anularPotrero(): Promise<void> {
    if (!this.potrero || this.procesando) return;
    this.procesando = true;
    this.cd.detectChanges();
    try {
      await this.potrerosService.anularPotrero(this.uuid, this.potrero.NOM_POTRERO);
      this.toast.success(`Listo: el potrero ${this.potrero.NOM_POTRERO} quedó anulado.`, 'Éxito', 5000, true, true, true);
      this.router.navigate(['/app/potreros']);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
      this.procesando = false;
      this.porAnularPotrero = false;
      this.cd.detectChanges();
    }
  }
}
