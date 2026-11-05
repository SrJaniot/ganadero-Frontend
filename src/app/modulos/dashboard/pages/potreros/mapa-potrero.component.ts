import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
import type * as LeafletTipos from 'leaflet';

//UN POTRERO PARA DIBUJAR DE FONDO (LOS DEMAS DE LA FINCA, PARA UBICARSE)
export interface ContornoVecino {
  nombre: string;
  contorno: [number, number][];
}

//CENTRO MIENTRAS NO HAY PUNTOS: SAN GIL (SANTANDER)
const CENTRO_POR_DEFECTO: [number, number] = [6.5555, -73.1336];

//MAPA DE UN POTRERO (OpenStreetMap CON LEAFLET, COMO EL DE MONCHIS: SIN CLAVES NI COBROS). ES OPCIONAL: LOS MOSAICOS NECESITAN SEÑAL
//editable: CADA TOQUE AGREGA UN PUNTO DEL CONTORNO; "Deshacer" QUITA EL ULTIMO Y "Borrar" TODOS. LEAFLET SE CARGA SOLO AL ABRIR UN MAPA
@Component({
  selector: 'app-mapa-potrero',
  standalone: false,
  templateUrl: './mapa-potrero.component.html',
})
export class MapaPotreroComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() contorno: [number, number][] = [];
  @Input() vecinos: ContornoVecino[] = [];
  @Input() editable = false;
  @Input() nombre = '';
  @Input() alto = '18rem';
  @Output() contornoChange = new EventEmitter<[number, number][]>();

  @ViewChild('contenedor', { static: true }) contenedor!: ElementRef<HTMLDivElement>;

  sinSenal = typeof navigator !== 'undefined' && !navigator.onLine;
  ubicando = false;
  errorUbicacion = '';
  errorCarga = false;
  private L: typeof LeafletTipos | null = null;
  private mapa: LeafletTipos.Map | null = null;
  private capa: LeafletTipos.LayerGroup | null = null;
  private conVista = false;

  constructor(private zona: NgZone, private cd: ChangeDetectorRef) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      //LEAFLET ES COMMONJS: EN EL BUILD DE PRODUCCION LLEGA DENTRO DE "default" (CON ng serve NO)
      const modulo: any = await import('leaflet');
      this.L = (modulo.default ?? modulo) as typeof LeafletTipos;
    } catch {
      this.errorCarga = true;
      this.cd.detectChanges();
      return;
    }
    const L = this.L;
    this.zona.runOutsideAngular(() => {
      this.mapa = L.map(this.contenedor.nativeElement, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(this.mapa);
      this.capa = L.layerGroup().addTo(this.mapa);
      this.mapa.on('click', (evento: LeafletTipos.LeafletMouseEvent) => {
        if (this.editable) {
          this.zona.run(() => this.emitir([...this.contorno, [redondear(evento.latlng.lat), redondear(evento.latlng.lng)]]));
        }
      });
    });
    this.dibujar();
    setTimeout(() => this.mapa?.invalidateSize(), 200);
  }

  ngOnChanges(): void {
    this.dibujar();
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }

  private emitir(puntos: [number, number][]): void {
    this.contorno = puntos;
    this.contornoChange.emit(puntos);
    this.dibujar();
    this.cd.detectChanges();
  }

  deshacer(): void {
    this.emitir(this.contorno.slice(0, -1));
  }

  borrar(): void {
    this.emitir([]);
  }

  //LOS TRAZOS SVG DE LEAFLET NO ENTIENDEN var(--...): SE LEE EL COLOR DEL TEMA
  private color(variable: string, porDefecto: string): string {
    return getComputedStyle(this.contenedor.nativeElement).getPropertyValue(variable).trim() || porDefecto;
  }

  private dibujar(): void {
    const L = this.L;
    if (!L || !this.mapa || !this.capa) return;
    this.capa.clearLayers();
    const verde = this.color('--primario', '#2F6B2F');
    const suave = this.color('--suave', '#4B5641');
    const limites: [number, number][] = [];

    //LOS DEMAS POTREROS, TENUES Y CON SU NOMBRE
    for (const v of this.vecinos) {
      if (v.contorno?.length >= 3) {
        L.polygon(v.contorno, { color: suave, weight: 1.5, fillOpacity: 0.06, dashArray: '4 5', interactive: false })
          .bindTooltip(v.nombre, { permanent: true, direction: 'center', className: 'etiqueta-potrero' }).addTo(this.capa);
        limites.push(...v.contorno);
      }
    }

    //EL POTRERO
    const puntos = this.contorno ?? [];
    if (puntos.length >= 3) {
      const poligono = L.polygon(puntos, { color: verde, weight: 3, fillColor: verde, fillOpacity: 0.18 }).addTo(this.capa);
      if (this.nombre) poligono.bindTooltip(this.nombre, { permanent: true, direction: 'center', className: 'etiqueta-potrero' });
    } else if (puntos.length === 2) {
      L.polyline(puntos, { color: verde, weight: 3 }).addTo(this.capa);
    }
    if (this.editable) {
      puntos.forEach(p => L.circleMarker(p, { radius: 6, color: '#FFFFFF', weight: 2, fillColor: verde, fillOpacity: 1 }).addTo(this.capa!));
    }

    //LA VISTA SE PONE UNA SOLA VEZ (AL EDITAR NO SE MUEVE CON CADA TOQUE)
    if (!this.conVista) {
      const todos = puntos.length ? puntos : limites;
      if (todos.length >= 2) {
        this.mapa.fitBounds(L.latLngBounds(todos), { padding: [24, 24], maxZoom: 17 });
      } else if (todos.length === 1) {
        this.mapa.setView(todos[0], 17);
      } else {
        this.mapa.setView(CENTRO_POR_DEFECTO, 14);
      }
      this.conVista = true;
    }
  }

  //CENTRA EL MAPA DONDE ESTA LA PERSONA (EL GPS FUNCIONA SIN SEÑAL; LOS MOSAICOS NO)
  usarMiUbicacion(): void {
    if (!navigator.geolocation) {
      this.errorUbicacion = 'Este celular no deja saber dónde estás.';
      return;
    }
    this.ubicando = true;
    this.errorUbicacion = '';
    navigator.geolocation.getCurrentPosition(
      pos => this.zona.run(() => {
        this.ubicando = false;
        this.mapa?.setView([pos.coords.latitude, pos.coords.longitude], 17);
        this.cd.detectChanges();
      }),
      () => this.zona.run(() => {
        this.ubicando = false;
        this.errorUbicacion = 'No se pudo saber dónde estás. Revisa que el GPS esté prendido y que la app tenga permiso.';
        this.cd.detectChanges();
      }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
    this.cd.detectChanges();
  }
}

//6 DECIMALES = UNOS 10 CM: SUFICIENTE PARA UN POTRERO
function redondear(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
