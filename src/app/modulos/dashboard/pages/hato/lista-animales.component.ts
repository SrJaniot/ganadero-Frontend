import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { SeguridadService } from '../../../../servicios/seguridad';
import { AnimalVista, aVista, compararPorChapeta } from './hato-vista';

//EL HATO DEL CELULAR (DEXIE): BUSCAR POR CHAPETA O NOMBRE, FUNCIONA SIN SEÑAL
//observarAnimales() SE ACTUALIZA SOLO AL REGISTRAR O AL SINCRONIZAR
@Component({
  selector: 'app-lista-animales',
  standalone: false,
  templateUrl: './lista-animales.component.html',
})
export class ListaAnimalesComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private seguridadService = inject(SeguridadService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  errorCarga = false;
  busqueda = '';
  animales: AnimalVista[] = [];
  puedeCrearAnimal = this.seguridadService.tienePermiso(3, 'guardar');

  private subscripcion: Subscription | null = null;

  ngOnInit(): void {
    try {
      this.subscripcion = this.almacenLocal.observarAnimales().subscribe({
        next: lista => {
          this.animales = lista.map(aVista).sort(compararPorChapeta);
          this.cargando = false;
          this.cd.detectChanges();
        },
        error: () => { this.errorCarga = true; this.cargando = false; this.cd.detectChanges(); },
      });
    } catch {
      this.errorCarga = true;
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripcion?.unsubscribe();
  }

  //BUSQUEDA EN EL CLIENTE: LA CHAPETA QUE EMPIEZA IGUAL VA PRIMERO
  get filtrados(): AnimalVista[] {
    const texto = this.busqueda.trim().toLowerCase();
    if (!texto) {
      return this.animales;
    }
    const empiezan = this.animales.filter(a => (a.chapeta ?? '').toLowerCase().startsWith(texto));
    const contienen = this.animales.filter(a => !empiezan.includes(a) && a.textoBusqueda.includes(texto));
    return [...empiezan, ...contienen];
  }

  limpiar(): void {
    this.busqueda = '';
  }
}
