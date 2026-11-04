import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { SeguridadService } from '../../../../servicios/seguridad';
import { AnimalVista, aVista, compararPorChapeta } from './hato-vista';

//'' = TODOS LOS LOTES; 'sin' = LOS QUE NO TIENEN LOTE; SI NO, EL UUID DEL LOTE
const SIN_LOTE = 'sin';

//EL HATO DEL CELULAR (DEXIE): BUSCAR POR CHAPETA O NOMBRE Y FILTRAR POR LOTE, CATEGORIA Y SEXO. FUNCIONA SIN SEÑAL
//observarAnimales() Y observarLotes() SE ACTUALIZAN SOLOS AL REGISTRAR O AL SINCRONIZAR. EL LOTE LLEGA EN LA URL (?lote=<uuid>)
@Component({
  selector: 'app-lista-animales',
  standalone: false,
  templateUrl: './lista-animales.component.html',
})
export class ListaAnimalesComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cd = inject(ChangeDetectorRef);

  readonly SIN_LOTE = SIN_LOTE;
  readonly categorias = ['Ternera', 'Novilla', 'Vaca', 'Ternero', 'Novillo', 'Toro'];

  cargando = true;
  errorCarga = false;
  busqueda = '';
  filtroLote = '';
  filtroCategoria = '';
  filtroSexo: '' | 'H' | 'M' = '';
  animales: AnimalVista[] = [];
  lotes: { uuid: string; nombre: string; animales: number }[] = [];
  puedeCrearAnimal = this.seguridadService.tienePermiso(3, 'guardar');

  private subscripciones: Subscription[] = [];

  ngOnInit(): void {
    this.subscripciones.push(
      this.route.queryParamMap.subscribe(params => {
        this.filtroLote = params.get('lote') ?? '';
        this.cd.detectChanges();
      }),
    );
    try {
      this.subscripciones.push(
        combineLatest([this.almacenLocal.observarAnimales(), this.almacenLocal.observarLotes()]).subscribe({
          next: ([lista, lotes]) => {
            //EL NOMBRE DEL LOTE SE TOMA DE LA TABLA DE LOTES (SI SE RENOMBRO SIN SEÑAL, EL ANIMAL TODAVIA TRAE EL NOMBRE VIEJO)
            const nombres = new Map(lotes.map(l => [l.UUID_LOTE, l.NOM_LOTE]));
            this.lotes = lotes.map(l => ({ uuid: l.UUID_LOTE, nombre: l.NOM_LOTE, animales: l.ANIMALES_ACTIVOS }));
            this.animales = lista
              .map(a => {
                const vista = aVista(a);
                if (vista.uuidLote) {
                  vista.lote = nombres.get(vista.uuidLote) ?? vista.lote;
                }
                return vista;
              })
              .sort(compararPorChapeta);
            this.cargando = false;
            this.cd.detectChanges();
          },
          error: () => { this.errorCarga = true; this.cargando = false; this.cd.detectChanges(); },
        }),
      );
    } catch {
      this.errorCarga = true;
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  //BUSQUEDA Y FILTROS EN EL CLIENTE: LA CHAPETA QUE EMPIEZA IGUAL VA PRIMERO
  get filtrados(): AnimalVista[] {
    const base = this.animales.filter(a =>
      (!this.filtroLote || (this.filtroLote === SIN_LOTE ? !a.uuidLote : a.uuidLote === this.filtroLote))
      && (!this.filtroCategoria || a.categoria === this.filtroCategoria)
      && (!this.filtroSexo || a.sexo === this.filtroSexo));
    const texto = this.busqueda.trim().toLowerCase();
    if (!texto) {
      return base;
    }
    const empiezan = base.filter(a => (a.chapeta ?? '').toLowerCase().startsWith(texto));
    const contienen = base.filter(a => !empiezan.includes(a) && a.textoBusqueda.includes(texto));
    return [...empiezan, ...contienen];
  }

  get hayFiltros(): boolean {
    return !!(this.busqueda.trim() || this.filtroLote || this.filtroCategoria || this.filtroSexo);
  }

  get sinLoteCuantos(): number {
    return this.animales.filter(a => !a.uuidLote).length;
  }

  //EL LOTE ELEGIDO VA EN LA URL (ASI "LOTES" PUEDE TRAER AQUI Y EL BOTON ATRAS FUNCIONA)
  elegirLote(lote: string): void {
    this.filtroLote = this.filtroLote === lote ? '' : lote;
    this.router.navigate([], { relativeTo: this.route, queryParams: { lote: this.filtroLote || null }, replaceUrl: true });
  }

  elegirCategoria(categoria: string): void {
    this.filtroCategoria = this.filtroCategoria === categoria ? '' : categoria;
    //UNA CATEGORIA YA DICE EL SEXO: SI NO CUADRA CON EL SEXO ELEGIDO, SE QUITA EL SEXO
    if (this.filtroCategoria && this.filtroSexo && this.sexoDeCategoria(this.filtroCategoria) !== this.filtroSexo) {
      this.filtroSexo = '';
    }
  }

  elegirSexo(sexo: 'H' | 'M'): void {
    this.filtroSexo = this.filtroSexo === sexo ? '' : sexo;
    if (this.filtroSexo && this.filtroCategoria && this.sexoDeCategoria(this.filtroCategoria) !== this.filtroSexo) {
      this.filtroCategoria = '';
    }
  }

  private sexoDeCategoria(categoria: string): 'H' | 'M' {
    return ['Ternera', 'Novilla', 'Vaca'].includes(categoria) ? 'H' : 'M';
  }

  get nombreFiltroLote(): string {
    if (this.filtroLote === SIN_LOTE) {
      return 'sin lote';
    }
    return this.lotes.find(l => l.uuid === this.filtroLote)?.nombre ?? 'un lote que ya no existe';
  }

  limpiar(): void {
    this.busqueda = '';
    this.filtroCategoria = '';
    this.filtroSexo = '';
    if (this.filtroLote) {
      this.elegirLote(this.filtroLote);
    }
  }
}
