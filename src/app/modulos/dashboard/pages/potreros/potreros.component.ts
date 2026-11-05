import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { LoteDTO, OcupacionDTO, PotreroDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { ahoraLocal, hoyLocal } from '../../../../servicios/hato.service';
import { EstadoHoyPotrero, estadoPotrero, PotrerosService } from '../../../../servicios/potreros.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { fechaLegible } from '../hato/hato-vista';

//VIEWMODEL DE UN POTRERO PARA LA LISTA
export interface PotreroVista {
  uuid: string;
  nombre: string;
  area: number | null;
  diasNecesarios: number;
  hoy: EstadoHoyPotrero;
  pendiente: boolean;
  fila: PotreroDTO;
}

const ORDEN_ESTADO = { OCUPADO: 0, LISTO: 1, DESCANSANDO: 2, SIN_USO: 3 };

//UNA FECHA DEL FORMULARIO (AAAA-MM-DD) A FECHA_EVENTO: HOY CON LA HORA DE AHORA; OTRO DIA A LAS 8 DE LA MAÑANA
export function fechaEvento(dia: string): string {
  return dia === hoyLocal() ? ahoraLocal() : dia + 'T08:00';
}

//POTREROS Y ROTACION (FASE 5A, MENU 3 HATO): EN QUE POTRERO ESTA CADA LOTE Y CUANTO LLEVA DESCANSANDO CADA POTRERO. FUNCIONA SIN SEÑAL
//EL ESTADO SE CALCULA CON LA COPIA DEL CELULAR (estadoPotrero, LA MISMA REGLA DE FUN_ESTADO_POTRERO); LA BASE REVISA TODO AL SUBIR
@Component({
  selector: 'app-potreros',
  standalone: false,
  templateUrl: './potreros.component.html',
})
export class PotrerosComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private potrerosService = inject(PotrerosService);
  private fincaActual = inject(FincaActualService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  errorCarga = false;
  potreros: PotreroVista[] = [];
  lotes: LoteDTO[] = [];
  ocupaciones: OcupacionDTO[] = [];
  puedeMover = this.seguridadService.tienePermiso(3, 'guardar');
  esDuenio = this.fincaActual.esDuenio;
  readonly fechaLegible = fechaLegible;
  readonly hoy = hoyLocal();

  //MOVER UN LOTE
  moviendo = false;
  guardando = false;
  moverLote: string | null = null;
  moverPotrero: string | null = null;
  moverDia = hoyLocal();
  errorMover = '';

  //SACAR UN LOTE
  sacando: { uuidOcupacion: string; nomLote: string; nomPotrero: string; entrada: string } | null = null;
  sacarDia = hoyLocal();
  errorSacar = '';

  private subscripcion: Subscription | null = null;

  ngOnInit(): void {
    try {
      this.subscripcion = this.almacenLocal.observarPotreros().subscribe({
        next: ({ potreros, ocupaciones, lotes }) => {
          this.lotes = [...lotes].sort((a, b) => a.NOM_LOTE.localeCompare(b.NOM_LOTE, 'es'));
          this.ocupaciones = ocupaciones;
          this.potreros = potreros.map(p => ({
            uuid: p.UUID_POTRERO, nombre: p.NOM_POTRERO, area: p.AREA_POTRERO === null ? null : Number(p.AREA_POTRERO),
            diasNecesarios: Number(p.DIAS_DESCANSO_POTRERO), hoy: estadoPotrero(p, ocupaciones, lotes), pendiente: !!p._pendiente, fila: p,
          })).sort((a, b) => ORDEN_ESTADO[a.hoy.estado] - ORDEN_ESTADO[b.hoy.estado]
            || (b.hoy.diasDescanso ?? 0) - (a.hoy.diasDescanso ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
          this.cargando = false;
          this.cd.detectChanges();
        },
        error: () => { this.errorCarga = true; this.cargando = false; this.cd.detectChanges(); },
      });
    } catch {
      this.errorCarga = true;
      this.cargando = false;
    }
    //?mover=<uuid del potrero>: ABRE "MOVER" CON ESE POTRERO ELEGIDO (DESDE LA FICHA DEL POTRERO)
    const potrero = this.route.snapshot.queryParamMap.get('mover');
    if (potrero) {
      this.abrirMover(potrero);
    }
  }

  ngOnDestroy(): void {
    this.subscripcion?.unsubscribe();
  }

  get resumen(): string {
    const cuenta = (e: string) => this.potreros.filter(p => p.hoy.estado === e).length;
    const partes = [
      [cuenta('OCUPADO'), 'ocupado', 'ocupados'], [cuenta('LISTO'), 'listo para entrar', 'listos para entrar'],
      [cuenta('DESCANSANDO'), 'descansando', 'descansando'], [cuenta('SIN_USO'), 'sin uso', 'sin uso'],
    ] as [number, string, string][];
    return partes.filter(([n]) => n > 0).map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`).join(' · ');
  }

  //LOS LOTES QUE NO ESTAN EN NINGUN POTRERO
  get lotesSinPotrero(): LoteDTO[] {
    return this.lotes.filter(l => !this.ocupaciones.some(o => o.UUID_LOTE === l.UUID_LOTE && !o.FECHA_SALIDA_OCUPACION));
  }

  //DONDE ESTA HOY UN LOTE (PARA EL FORMULARIO DE MOVER)
  potreroDeLote(uuidLote: string): PotreroVista | undefined {
    return this.potreros.find(p => p.hoy.lotes.some(l => l.uuidLote === uuidLote));
  }

  //---------------------------------------------MOVER---------------------------------------------------------------------------
  abrirMover(uuidPotrero: string | null = null, uuidLote: string | null = null): void {
    this.moviendo = true;
    this.moverPotrero = uuidPotrero;
    this.moverLote = uuidLote;
    this.moverDia = hoyLocal();
    this.errorMover = '';
    this.cd.detectChanges();
  }

  cerrarMover(): void {
    if (!this.guardando) {
      this.moviendo = false;
      this.cd.detectChanges();
    }
  }

  //LA ULTIMA ENTRADA O SALIDA DEL LOTE (LA BASE NO DEJA REGISTRAR ANTES DE ESA FECHA)
  private ultimoMovimiento(uuidLote: string): string | null {
    const fechas = this.ocupaciones.filter(o => o.UUID_LOTE === uuidLote)
      .flatMap(o => [o.FECHA_EVENTO, o.FECHA_SALIDA_OCUPACION].filter((f): f is string => !!f)).sort();
    return fechas.length ? fechas[fechas.length - 1] : null;
  }

  //MISMAS REGLAS QUE FUN_ENTRAR_LOTE_POTRERO_JSON (LA BASE LAS VUELVE A REVISAR)
  private validarMover(): string {
    if (!this.moverLote) return 'Elige el lote';
    if (!this.moverPotrero) return 'Elige el potrero';
    if (!this.moverDia) return 'Escribe la fecha';
    if (this.moverDia > hoyLocal()) return 'La fecha no puede ser futura';
    if (this.potreroDeLote(this.moverLote)?.uuid === this.moverPotrero) return 'El lote ya está en ese potrero';
    const ultimo = this.ultimoMovimiento(this.moverLote);
    if (ultimo && fechaEvento(this.moverDia) < ultimo.slice(0, 16)) {
      return `El lote ya tiene un movimiento del ${fechaLegible(ultimo)}: la entrada no puede ser antes`;
    }
    return '';
  }

  async guardarMover(): Promise<void> {
    if (this.guardando) return;
    this.errorMover = this.validarMover();
    if (this.errorMover) {
      this.cd.detectChanges();
      return;
    }
    const lote = this.lotes.find(l => l.UUID_LOTE === this.moverLote)!;
    const potrero = this.potreros.find(p => p.uuid === this.moverPotrero)!;
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.potrerosService.entrarLote(lote.UUID_LOTE, lote.NOM_LOTE, potrero.fila, fechaEvento(this.moverDia), null);
      this.toast.success(`Listo: el lote ${lote.NOM_LOTE} quedó en ${potrero.nombre}. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
      this.guardando = false;
      this.moviendo = false;
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
      this.guardando = false;
    }
    this.cd.detectChanges();
  }

  //---------------------------------------------SACAR---------------------------------------------------------------------------
  abrirSacar(potrero: PotreroVista, lote: EstadoHoyPotrero['lotes'][number]): void {
    this.sacando = { uuidOcupacion: lote.uuidOcupacion, nomLote: lote.nomLote, nomPotrero: potrero.nombre, entrada: lote.entrada };
    this.sacarDia = hoyLocal();
    this.errorSacar = '';
    this.cd.detectChanges();
  }

  cerrarSacar(): void {
    if (!this.guardando) {
      this.sacando = null;
      this.cd.detectChanges();
    }
  }

  async guardarSacar(): Promise<void> {
    const s = this.sacando;
    if (!s || this.guardando) return;
    const fecha = fechaEvento(this.sacarDia);
    this.errorSacar = !this.sacarDia ? 'Escribe la fecha' : this.sacarDia > hoyLocal() ? 'La fecha no puede ser futura'
      : fecha < s.entrada.slice(0, 16) ? `La salida no puede ser antes de la entrada (${fechaLegible(s.entrada)})` : '';
    if (this.errorSacar) {
      this.cd.detectChanges();
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.potrerosService.sacarLote(s.uuidOcupacion, s.nomLote, s.nomPotrero, fecha);
      this.toast.success(`Listo: el lote ${s.nomLote} salió de ${s.nomPotrero}. El potrero empieza a descansar.`, 'Éxito', 5000, true, true, true);
      this.guardando = false;
      this.sacando = null;
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
      this.guardando = false;
    }
    this.cd.detectChanges();
  }

  //"Descansando 12 de 30 días", "Listo: descansó 34 días"...
  textoEstado(p: PotreroVista): string {
    const h = p.hoy;
    switch (h.estado) {
      case 'OCUPADO': return `Ocupado hace ${h.diasOcupado} ${h.diasOcupado === 1 ? 'día' : 'días'}`;
      case 'LISTO': return `Listo para entrar: descansó ${h.diasDescanso} días`;
      case 'DESCANSANDO': return `Descansando: ${h.diasDescanso} de ${p.diasNecesarios} días`;
      default: return 'Sin uso registrado';
    }
  }

  //CUANTO LE FALTA (PARA LA BARRA DEL DESCANSO), DE 0 A 100
  avance(p: PotreroVista): number {
    return p.hoy.diasDescanso === null ? 0 : Math.min(100, Math.round((p.hoy.diasDescanso / p.diasNecesarios) * 100));
  }
}
