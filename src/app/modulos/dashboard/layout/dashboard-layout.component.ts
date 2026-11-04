import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { filter, finalize, Subscription } from 'rxjs';
import { ConfiguracionMenuLateral } from '../../../config/configuracion.menu.latreal';
import { FincaActual, NOMBRE_ROL_FINCA } from '../../../Modelos/GanaderoModel';
import { FincaActualService } from '../../../servicios/finca-actual.service';
import { SeguridadService } from '../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../servicios/sincronizacion.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: false,
  templateUrl: './dashboard-layout.component.html',
})
export class DashboardLayoutComponent implements OnInit, OnDestroy {
  private seguridadService = inject(SeguridadService);
  private fincaActual = inject(FincaActualService);
  private sincronizacion = inject(SincronizacionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  titulo = '';
  finca: FincaActual | null = null;
  estado: EstadoSincronizacion = this.sincronizacion.estado$.value;
  necesitaClave = false;
  //MENUS SEGUN LOS PERMISOS QUE LLEGARON AL INICIAR SESION (BARRA DE ABAJO)
  menus: { menuid: number; ruta: string; icono: string; texto: string; fase: number }[] = [];

  //VOLVER A ESCRIBIR LA CLAVE CUANDO EL TOKEN VENCIO (LA SESION NO SE CIERRA: LO DEL CELULAR SE CONSERVA)
  claveAbierta = false;
  reingresando = false;
  errorClave = '';
  claveForm = new FormGroup({
    clave: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private subscripciones: Subscription[] = [];

  ngOnInit(): void {
    this.cargarMenus();
    this.subscripciones.push(
      this.fincaActual.finca$.subscribe(finca => { this.finca = finca; this.cargarMenus(); this.cd.detectChanges(); }),
      this.sincronizacion.estado$.subscribe(estado => { this.estado = estado; this.cd.detectChanges(); }),
      this.seguridadService.necesitaClave.subscribe(falta => { this.necesitaClave = falta; this.cd.detectChanges(); }),
      this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => { this.actualizarTitulo(); this.cd.detectChanges(); }),
    );
    this.actualizarTitulo();
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  //SE TOMAN LOS menuid GUARDADOS Y LAS RUTAS DEL CATALOGO ACTUAL. "MI FINCA" SOLO PARA EL DUEÑO DE ESTA FINCA
  private cargarMenus() {
    const menuidsPermitidos = this.seguridadService.ObtenerItemMenuLateral().map(m => m.menuid);
    this.menus = ConfiguracionMenuLateral.listaMenus
      .filter(m => menuidsPermitidos.includes(m.menuid))
      .filter(m => m.menuid !== 2 || this.fincaActual.esDuenio);
  }

  private actualizarTitulo() {
    let ruta = this.route;
    while (ruta.firstChild) {
      ruta = ruta.firstChild;
    }
    //EL TITULO PUEDE ESTAR EN LA RUTA HIJA O EN LA DEL MODULO
    this.titulo = ruta.snapshot.data['titulo'] ?? ruta.parent?.snapshot.data['titulo'] ?? '';
  }

  get nombreRol(): string {
    return this.finca ? NOMBRE_ROL_FINCA[this.finca.rol] ?? '' : '';
  }

  //---------------------------------------------INDICADOR DE ARRIBA---------------------------------------------------------------
  get textoIndicador(): string {
    if (this.necesitaClave) return 'Falta tu clave';
    if (this.estado.sincronizando) return 'Subiendo...';
    if (!this.estado.enLinea) return this.estado.pendientes > 0 ? `Sin señal · ${this.estado.pendientes} por subir` : 'Sin señal';
    if (this.estado.rechazados > 0) return `${this.estado.rechazados} con problema`;
    if (this.estado.pendientes > 0) return `${this.estado.pendientes} por subir`;
    return 'Todo guardado';
  }

  get iconoIndicador(): string {
    if (this.necesitaClave) return 'candado';
    if (this.estado.sincronizando) return 'sincronizar';
    if (!this.estado.enLinea) return 'sin-senal';
    if (this.estado.rechazados > 0) return 'alerta';
    if (this.estado.pendientes > 0) return 'celular';
    return 'nube';
  }

  get claseIndicador(): string {
    if (this.necesitaClave || this.estado.rechazados > 0) return 'bg-peligro-fondo text-peligro border-peligro/30';
    if (!this.estado.enLinea || this.estado.pendientes > 0) return 'bg-aviso-fondo text-aviso border-aviso/30';
    return 'bg-exito-fondo text-exito border-exito/30';
  }

  tocarIndicador() {
    if (this.necesitaClave) {
      this.abrirClave();
      return;
    }
    this.router.navigate(['/app/sincronizacion']);
  }

  //---------------------------------------------VOLVER A ESCRIBIR LA CLAVE--------------------------------------------------------
  abrirClave() {
    this.errorClave = '';
    this.claveForm.reset();
    this.claveAbierta = true;
  }

  cerrarClave() {
    this.claveAbierta = false;
  }

  reingresar() {
    this.errorClave = '';
    if (this.claveForm.invalid) {
      this.claveForm.markAllAsTouched();
      return;
    }
    if (!navigator.onLine) {
      this.errorClave = 'Sin señal no se puede revisar la clave. Lo que registres queda guardado en el celular';
      return;
    }
    this.reingresando = true;
    this.seguridadService.Reingresar(this.claveForm.getRawValue().clave)
      .pipe(finalize(() => { this.reingresando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta) => {
          if (respuesta.CODIGO === 200) {
            this.claveAbierta = false;
            this.toast.success('Listo: ya se puede subir lo que registraste', 'Éxito', 5000, true, true, true);
          } else {
            this.errorClave = respuesta.MENSAJE || 'La clave no es correcta';
            this.claveForm.reset();
          }
        },
        error: () => {
          this.errorClave = 'No hay conexión con el servidor. Intenta de nuevo';
        }
      });
  }
}
