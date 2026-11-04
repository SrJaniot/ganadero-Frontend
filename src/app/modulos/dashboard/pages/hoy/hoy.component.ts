import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlertasGuardadas } from '../../../../Modelos/GanaderoModel';
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
  //MENU 5 = HOY Y ALERTAS (LAS CALCULA LA BASE; EL CELULAR GUARDA LAS DE LA ULTIMA SINCRONIZACION)
  puedeVerAlertas = this.seguridadService.tienePermiso(5, 'listar');
  alertas: AlertasGuardadas | null = null;

  //LO MAS URGENTE EN FRASES CORTAS PARA LA TARJETA "PARA HOY" (EL DETALLE ESTA EN /app/alertas)
  get resumenAlertas(): { texto: string; urgente: boolean }[] {
    const a = this.alertas?.alertas;
    if (!a) return [];
    const lineas: { texto: string; urgente: boolean }[] = [];
    const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
    if (a.RETIROS_LECHE.length) lineas.push({ texto: `No vender la leche de ${n(a.RETIROS_LECHE.length, 'animal', 'animales')}`, urgente: true });
    if (a.PARTOS_PROXIMOS.length) lineas.push({ texto: `${n(a.PARTOS_PROXIMOS.length, 'parto próximo', 'partos próximos')}`, urgente: a.PARTOS_PROXIMOS.some(x => x.DIAS <= 7) });
    if (a.PALPAR.length) lineas.push({ texto: `${n(a.PALPAR.length, 'para palpar', 'para palpar')}`, urgente: false });
    if (a.VACIAS.length) lineas.push({ texto: `${n(a.VACIAS.length, 'vaca vacía', 'vacas vacías')}`, urgente: false });
    if (a.VACUNAS_POR_APLICAR.length) lineas.push({ texto: `${n(a.VACUNAS_POR_APLICAR.length, 'vacuna por aplicar', 'vacunas por aplicar')}`, urgente: a.VACUNAS_POR_APLICAR.some(x => x.DIAS < 0) });
    const ciclos = a.CICLOS_ICA.filter(c => c.VIGENTE && c.FALTAN > 0);
    if (ciclos.length) lineas.push({ texto: `Ciclo del ICA: faltan ${n(ciclos[0].FALTAN, 'animal', 'animales')}`, urgente: true });
    return lineas;
  }

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
    if (this.puedeVerAlertas) {
      try {
        this.subscripciones.push(
          this.almacenLocal.observarMeta<AlertasGuardadas>('ALERTAS').subscribe(alertas => { this.alertas = alertas; this.cd.detectChanges(); }),
        );
      } catch { }
    }
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
