import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { AnimalDTO } from '../../Modelos/GanaderoModel';
import { aVista, AnimalVista, compararPorChapeta } from '../../modulos/dashboard/pages/hato/hato-vista';
import { AlmacenLocalService } from '../../servicios/almacen-local';

//ELEGIR UN ANIMAL DEL HATO DEL CELULAR POR CHAPETA O NOMBRE (SIN SEÑAL). LO USAN TODOS LOS EVENTOS
//USO: <app-elegir-animal [sexo]="'H'" [uuidInicial]="uuid" [motivoNoValido]="fn" (elegido)="alElegir($event)" />
//motivoNoValido(animal) DEVUELVE EL TEXTO DE POR QUE NO SIRVE (EJ: "es una ternera") O null SI SIRVE: EL ANIMAL SALE PERO NO SE PUEDE TOCAR
@Component({
  selector: 'app-elegir-animal',
  standalone: false,
  templateUrl: './elegir-animal.html',
})
export class ElegirAnimal implements OnInit, OnChanges, OnDestroy {
  @Input() titulo = '¿Qué animal?';
  @Input() sexo: 'H' | 'M' | null = null;
  @Input() uuidInicial: string | null = null;
  @Input() motivoNoValido: ((animal: AnimalDTO) => string | null) | null = null;
  @Output() elegido = new EventEmitter<AnimalDTO | null>();
  @ViewChild('campo') campo?: ElementRef<HTMLInputElement>;

  busqueda = '';
  cargando = true;
  animales: AnimalDTO[] = [];
  seleccionado: AnimalDTO | null = null;
  private suscripcion: Subscription | null = null;

  constructor(private almacenLocal: AlmacenLocalService, private cd: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.suscripcion = this.almacenLocal.observarAnimales(true).subscribe(lista => {
      this.animales = lista.filter(a => !this.sexo || a.SEXO_ANIMAL === this.sexo);
      this.cargando = false;
      //SI EL ANIMAL ELEGIDO CAMBIO (SINCRONIZACION), SE REFRESCA; SI LLEGO POR LA URL, SE ELIGE
      if (this.seleccionado) {
        this.seleccionado = this.animales.find(a => a.UUID_ANIMAL === this.seleccionado!.UUID_ANIMAL) ?? this.seleccionado;
      } else if (this.uuidInicial) {
        this.elegirInicial();
      }
      this.cd.detectChanges();
    });
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['uuidInicial'] && !cambios['uuidInicial'].firstChange && this.uuidInicial) {
      this.elegirInicial();
    }
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  private elegirInicial(): void {
    const inicial = this.animales.find(a => a.UUID_ANIMAL === this.uuidInicial);
    if (inicial && !this.motivo(inicial)) {
      this.elegir(inicial);
    }
  }

  motivo(animal: AnimalDTO): string | null {
    return this.motivoNoValido ? this.motivoNoValido(animal) : null;
  }

  vista(animal: AnimalDTO): AnimalVista {
    return aVista(animal);
  }

  //PRIMERO LA CHAPETA EXACTA, LUEGO LAS QUE EMPIEZAN IGUAL Y LUEGO POR NOMBRE. MAXIMO 6
  get coincidencias(): AnimalDTO[] {
    const texto = this.busqueda.trim().toLowerCase();
    if (!texto) {
      return [];
    }
    const conVista = this.animales.map(a => ({ a, v: aVista(a) }));
    const exacta = conVista.filter(x => (x.v.chapeta ?? '').toLowerCase() === texto);
    const empiezan = conVista.filter(x => !exacta.includes(x) && (x.v.chapeta ?? '').toLowerCase().startsWith(texto)).sort((x, y) => compararPorChapeta(x.v, y.v));
    const nombre = conVista.filter(x => !exacta.includes(x) && !empiezan.includes(x) && x.v.textoBusqueda.includes(texto));
    return [...exacta, ...empiezan, ...nombre].slice(0, 6).map(x => x.a);
  }

  alEnter(): void {
    const lista = this.coincidencias.filter(a => !this.motivo(a));
    if (lista.length === 1) {
      this.elegir(lista[0]);
    }
  }

  elegir(animal: AnimalDTO): void {
    if (this.motivo(animal)) {
      return;
    }
    this.seleccionado = animal;
    this.elegido.emit(animal);
    this.cd.detectChanges();
  }

  cambiar(): void {
    this.seleccionado = null;
    this.busqueda = '';
    this.elegido.emit(null);
    this.cd.detectChanges();
    setTimeout(() => this.campo?.nativeElement.focus(), 0);
  }
}
