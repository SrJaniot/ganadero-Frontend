import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { SeguridadService } from '../../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';

interface BotonHoy {
  texto: string;
  icono: string;
  ruta: string;
}

//INICIO "¿QUE PASO HOY?": BOTONES GRANDES PARA REGISTRAR (ANIMAL NUEVO, PESE Y LOS EVENTOS DE LA FASE 2)
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
    { texto: 'Ordeñé', icono: 'gota', ruta: '/app/evento/ordeno' },
    { texto: 'Pesé', icono: 'pesa', ruta: '/app/pesar' },
    { texto: 'Vacuné / Traté', icono: 'jeringa', ruta: '/app/evento/vacunacion' },
    { texto: 'Monta / Inseminación', icono: 'corazon', ruta: '/app/evento/servicio' },
    { texto: 'Palpé', icono: 'buscar', ruta: '/app/evento/palpacion' },
    { texto: 'Parió', icono: 'biberon', ruta: '/app/evento/parto' },
    { texto: 'Salió', icono: 'salida', ruta: '/app/evento/salida' },
  ];

  //CUANTOS BOTONES SE VEN: SI SON IMPARES, EL ULTIMO OCUPA LAS DOS COLUMNAS EN EL CELULAR (LA CUADRICULA NO QUEDA COJA)
  get totalBotones(): number {
    return (this.puedeCrearAnimal ? 1 : 0) + (this.puedeRegistrarEventos ? this.botones.length : 0);
  }

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
