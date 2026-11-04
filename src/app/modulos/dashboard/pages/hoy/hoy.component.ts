import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { SeguridadService } from '../../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';

interface BotonHoy {
  texto: string;
  icono: string;
  ruta: string;
  listo: boolean;        //FASE 0: SOLO PESE FUNCIONA; LOS DEMAS LLEVAN "PRONTO"
}

//INICIO "¿QUE PASO HOY?": BOTONES GRANDES PARA REGISTRAR (FASE 0: PESE Y ANIMAL NUEVO; LOS DEMAS LLEGAN EN LA FASE 2)
//TODO SALE DEL CELULAR (DEXIE): FUNCIONA SIN SEÑAL
@Component({
  selector: 'app-hoy',
  standalone: false,
  templateUrl: './hoy.component.html',
})
export class HoyComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private sincronizacion = inject(SincronizacionService);
  private seguridadService = inject(SeguridadService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  totalActivos = 0;
  estado: EstadoSincronizacion = this.sincronizacion.estado$.value;

  //MENU 4 = EVENTOS (PESE, ORDEÑE...), MENU 3 = HATO (ANIMAL NUEVO)
  puedeRegistrarEventos = this.seguridadService.tienePermiso(4, 'guardar');
  puedeCrearAnimal = this.seguridadService.tienePermiso(3, 'guardar');

  readonly botones: BotonHoy[] = [
    { texto: 'Ordeñé', icono: 'gota', ruta: '/app/evento/ordeno', listo: false },
    { texto: 'Pesé', icono: 'pesa', ruta: '/app/pesar', listo: true },
    { texto: 'Vacuné / Traté', icono: 'jeringa', ruta: '/app/evento/vacunacion', listo: false },
    { texto: 'Monta / Inseminación', icono: 'corazon', ruta: '/app/evento/servicio', listo: false },
    { texto: 'Parió', icono: 'biberon', ruta: '/app/evento/parto', listo: false },
    { texto: 'Salió', icono: 'salida', ruta: '/app/evento/salida', listo: false },
  ];

  private subscripciones: Subscription[] = [];

  ngOnInit(): void {
    this.subscripciones.push(
      this.sincronizacion.estado$.subscribe(estado => { this.estado = estado; this.cd.detectChanges(); }),
    );
    try {
      this.subscripciones.push(
        this.almacenLocal.observarAnimales().subscribe({
          next: animales => { this.totalActivos = animales.length; this.cargando = false; this.cd.detectChanges(); },
          error: () => { this.cargando = false; this.cd.detectChanges(); },
        }),
      );
    } catch {
      //SIN FINCA ABIERTA (NO DEBERIA PASAR: EL GUARD LA EXIGE)
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  get hatoVacio(): boolean {
    return !this.cargando && this.totalActivos === 0;
  }
}
