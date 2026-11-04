import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlmacenLocalService } from '../../../servicios/almacen-local';
import { FincaActualService } from '../../../servicios/finca-actual.service';
import { SeguridadService } from '../../../servicios/seguridad';
import { SincronizacionService } from '../../../servicios/sincronizacion.service';

//CERRAR SESION. ANTES SE CUENTA LO QUE NO HA SUBIDO EN TODAS LAS FINCAS DEL CELULAR:
//AL CERRAR SE BORRAN LAS BASES LOCALES, ASI QUE CON PENDIENTES SE AVISA Y SE OFRECE SINCRONIZAR PRIMERO
@Component({
  selector: 'app-cerrar-sesion',
  standalone: false,
  templateUrl: './cerrar-sesion.html',
})
export class CerrarSesion implements OnInit {

  revisando = true;
  cerrando = false;
  sincronizando = false;
  pendientes = 0;
  errorSincronizar = '';
  confirmarAbierto = false;

  constructor(
    private servicioSeguridad: SeguridadService,
    private almacenLocal: AlmacenLocalService,
    private fincaActual: FincaActualService,
    private sincronizacion: SincronizacionService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) { }

  async ngOnInit() {
    await this.contarPendientes();
    if (this.pendientes === 0) {
      this.CerrarSesion();
    }
  }

  get hayFincaAbierta(): boolean {
    return !!this.fincaActual.actual;
  }

  private async contarPendientes() {
    this.revisando = true;
    this.cd.detectChanges();
    try {
      this.pendientes = await this.almacenLocal.pendientesEnTodasLasFincas();
    } catch {
      //SI NO SE PUEDE LEER EL ALMACEN NO HAY NADA QUE SE PUEDA PERDER
      this.pendientes = 0;
    }
    this.revisando = false;
    this.cd.detectChanges();
  }

  //SUBE LO DE LA FINCA ABIERTA Y VUELVE A CONTAR. SI YA NO QUEDA NADA, CIERRA
  async sincronizarPrimero() {
    this.errorSincronizar = '';
    if (!navigator.onLine) {
      this.errorSincronizar = 'No hay señal. Busca un lugar con señal y vuelve a intentar';
      this.cd.detectChanges();
      return;
    }
    this.sincronizando = true;
    this.cd.detectChanges();
    const bien = await this.sincronizacion.sincronizar();
    this.sincronizando = false;
    if (!bien) {
      this.errorSincronizar = this.sincronizacion.estado$.value.error || 'No se pudo sincronizar. Intenta de nuevo';
    }
    await this.contarPendientes();
    if (this.pendientes === 0) {
      this.CerrarSesion();
    } else if (bien) {
      //LO QUE QUEDA FUE RECHAZADO POR EL SERVIDOR O ES DE OTRA FINCA DEL CELULAR
      this.errorSincronizar = 'Quedan registros que no se pudieron subir. Revísalos en «Sincronizar» o en la otra finca';
      this.cd.detectChanges();
    }
  }

  volverALaApp() {
    this.router.navigate([this.hayFincaAbierta ? '/app/sincronizacion' : '/fincas']);
  }

  abrirConfirmar() {
    this.confirmarAbierto = true;
    this.cd.detectChanges();
  }

  cerrarConfirmar() {
    if (!this.cerrando) {
      this.confirmarAbierto = false;
      this.cd.detectChanges();
    }
  }

  async CerrarSesion() {
    this.cerrando = true;
    this.cd.detectChanges();
    try {
      await this.almacenLocal.borrarTodo();
    } catch {
      //SI DEXIE FALLA IGUAL SE CIERRA LA SESION
    }
    await this.servicioSeguridad.RemoverDatosUsuarioValidadoSesion();
    this.fincaActual.olvidar();
    this.confirmarAbierto = false;
    this.pendientes = 0;
    this.cd.detectChanges();
    this.delayNavigation(1500);
  }

  delayNavigation(ms: number): void {
    setTimeout(() => {
      this.router.navigate(['/seguridad/ingreso']);
    }, ms);
  }

}
