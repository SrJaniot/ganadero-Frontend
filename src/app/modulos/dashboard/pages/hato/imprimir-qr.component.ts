import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { enlaceAnimal } from '../../../../compartido/codigo-qr/codigo-qr';
import { AnimalDTO, LoteDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { categoriaAnimal } from '../../../../servicios/hato.service';
import { compararPorChapeta } from './hato-vista';

interface EtiquetaQr {
  uuid: string;
  enlace: string;
  chapeta: string;
  nombre: string;
  categoria: string;
}

//HOJA DE QR PARA IMPRIMIR Y PEGAR EN LA CHAPETA O EN EL CORRAL (FASE 5C). CADA QR ABRE LA FICHA DEL ANIMAL
//?animal=<uuid> IMPRIME SOLO ESE; SI NO, TODOS LOS ACTIVOS O LOS DE UN LOTE. FUNCIONA SIN SEÑAL (EL QR SE DIBUJA EN EL CELULAR)
@Component({
  selector: 'app-imprimir-qr',
  standalone: false,
  templateUrl: './imprimir-qr.component.html',
})
export class ImprimirQrComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private fincaActual = inject(FincaActualService);
  private route = inject(ActivatedRoute);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  nombreFinca = this.fincaActual.finca$.value?.nombre ?? '';
  soloAnimal = this.route.snapshot.queryParamMap.get('animal');
  lotes: LoteDTO[] = [];
  filtroLote: string | null = null;
  private animales: AnimalDTO[] = [];
  private subscripciones: Subscription[] = [];

  ngOnInit(): void {
    this.subscripciones.push(
      this.almacenLocal.observarAnimales(true).subscribe(lista => {
        this.animales = lista;
        this.cargando = false;
        this.cd.detectChanges();
      }),
      this.almacenLocal.observarLotes().subscribe(lotes => {
        this.lotes = lotes.filter(l => l.ANIMALES_ACTIVOS > 0);
        this.cd.detectChanges();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  get etiquetas(): EtiquetaQr[] {
    return this.animales
      .filter(a => this.soloAnimal ? a.UUID_ANIMAL === this.soloAnimal : !this.filtroLote || a.UUID_LOTE === this.filtroLote)
      .map(a => ({ a, orden: { chapeta: a.CHAPETA_ANIMAL, nombre: a.NOM_ANIMAL } }))
      .sort((x, y) => compararPorChapeta(x.orden, y.orden))
      .map(({ a }) => ({
        uuid: a.UUID_ANIMAL, enlace: enlaceAnimal(a.UUID_ANIMAL), chapeta: a.CHAPETA_ANIMAL ?? 'Sin chapeta', nombre: a.NOM_ANIMAL ?? '',
        categoria: categoriaAnimal(a).charAt(0) + categoriaAnimal(a).slice(1).toLowerCase(),
      }));
  }

  elegirLote(uuid: string | null): void {
    this.filtroLote = this.filtroLote === uuid ? null : uuid;
    this.cd.detectChanges();
  }

  imprimir(): void {
    window.print();
  }
}
