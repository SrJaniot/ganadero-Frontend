import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlertasGuardadas, AnimalAlerta } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { hoyLocal } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';
import { fechaHoraLocalLegible, fechaLegible } from '../hato/hato-vista';

//HOY Y ALERTAS (MENU 5): LO QUE HAY QUE HACER HOY EN LA FINCA
//LAS ALERTAS LAS CALCULA LA BASE (FUN_OBTENER_ALERTAS_JSON) Y EL CELULAR GUARDA LA RESPUESTA EN CADA SINCRONIZACION: SIN SEÑAL SE VEN
//LAS DE LA ULTIMA VEZ, CON LA FECHA A LA VISTA. LO REGISTRADO SIN SEÑAL CAMBIA LAS ALERTAS CUANDO SE SINCRONICE
@Component({
  selector: 'app-alertas',
  standalone: false,
  templateUrl: './alertas.component.html',
})
export class AlertasComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private sincronizacion = inject(SincronizacionService);
  private seguridadService = inject(SeguridadService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  guardadas: AlertasGuardadas | null = null;
  estado: EstadoSincronizacion = this.sincronizacion.estado$.value;
  puedeRegistrar = this.seguridadService.tienePermiso(4, 'guardar');
  private subscripciones: Subscription[] = [];

  readonly fechaLegible = fechaLegible;

  ngOnInit(): void {
    this.subscripciones.push(
      this.almacenLocal.observarMeta<AlertasGuardadas>('ALERTAS').subscribe(guardadas => {
        this.guardadas = guardadas;
        this.cargando = false;
        this.cd.detectChanges();
      }),
      this.sincronizacion.estado$.subscribe(estado => { this.estado = estado; this.cd.detectChanges(); }),
    );
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  get a() {
    return this.guardadas?.alertas ?? null;
  }

  //CUANTOS AVISOS HAY EN TOTAL (UN CICLO DEL ICA CUENTA SI LE FALTAN ANIMALES)
  get total(): number {
    const a = this.a;
    if (!a) return 0;
    return a.RETIROS_LECHE.length + a.PARTOS_PROXIMOS.length + a.PALPAR.length + a.VACIAS.length + a.VACUNAS_POR_APLICAR.length
      + a.CICLOS_ICA.filter(c => c.FALTAN > 0).length;
  }

  //LAS ALERTAS SON DE OTRO DIA (NO SE HA SINCRONIZADO HOY)
  get diasViejas(): number {
    if (!this.a) return 0;
    const [a1, m1, d1] = this.a.FECHA.slice(0, 10).split('-').map(Number);
    const [a2, m2, d2] = hoyLocal().split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }

  get recibidas(): string {
    return this.guardadas ? fechaHoraLocalLegible(this.guardadas.recibidas) : '';
  }

  nombre(x: AnimalAlerta): string {
    if (x.CHAPETA_ANIMAL && x.NOM_ANIMAL) return `${x.CHAPETA_ANIMAL} · ${x.NOM_ANIMAL}`;
    return x.CHAPETA_ANIMAL ?? x.NOM_ANIMAL ?? 'Sin chapeta';
  }

  //"en 13 días", "hoy", "hace 4 días"
  cuando(dias: number): string {
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    if (dias > 0) return `en ${dias} días`;
    return dias === -1 ? 'ayer' : `hace ${-dias} días`;
  }

  actualizar(): void {
    this.sincronizacion.sincronizar();
  }
}
