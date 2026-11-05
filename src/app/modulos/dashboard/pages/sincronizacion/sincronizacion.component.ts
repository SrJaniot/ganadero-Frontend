import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NgToastService } from 'ng-angular-popup';
import { finalize, Subscription } from 'rxjs';
import { RegistroBandeja, SincronizacionDTO, TipoRegistro } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';
import { fechaHoraLocalLegible } from '../hato/hato-vista';

const ICONO_POR_TIPO: Record<TipoRegistro, string> = {
  LOTE: 'finca', ANIMAL: 'vaca', PESAJE: 'pesa', VACUNACION: 'jeringa', SERVICIO: 'corazon',
  PALPACION: 'corazon', PARTO: 'biberon', ORDENO: 'gota', SALIDA: 'salida', POTRERO: 'pasto', OCUPACION: 'mapa',
};

interface RegistroVista {
  orden: number;
  descripcion: string;
  fecha: string;
  icono: string;
  rechazado: boolean;
  mensaje: string | null;
}

interface SincronizacionVista {
  id: number;
  fecha: string;
  persona: string;
  guardados: number;
  omitidos: number;
  rechazados: number;
}

//SINCRONIZACION: PENDIENTES, RECHAZADOS (CORREGIR O DESCARTAR), ULTIMA VEZ Y BOTON PARA FORZAR
//LA BANDEJA ES DEL CELULAR (SIN SEÑAL); SOLO "ULTIMAS SINCRONIZACIONES" PIDE SEÑAL
@Component({
  selector: 'app-sincronizacion',
  standalone: false,
  templateUrl: './sincronizacion.component.html',
})
export class SincronizacionComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private sincronizacion = inject(SincronizacionService);
  private seguridadService = inject(SeguridadService);
  private fincaActual = inject(FincaActualService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  estado: EstadoSincronizacion = this.sincronizacion.estado$.value;
  necesitaClave = this.seguridadService.necesitaClave.value;

  cargandoBandeja = true;
  bandeja: RegistroVista[] = [];

  cargandoServidor = false;
  errorServidor = '';
  sincronizaciones: SincronizacionVista[] = [];

  //DESCARTAR UN RECHAZADO (CON CONFIRMACION)
  porDescartar: RegistroVista | null = null;
  descartando = false;
  reintentando: number | null = null;

  private subscripciones: Subscription[] = [];
  private estabaSincronizando = false;
  private yaPidioServidor = false;

  ngOnInit(): void {
    this.subscripciones.push(
      this.sincronizacion.estado$.subscribe(estado => {
        //AL TERMINAR UNA SINCRONIZACION (O AL VOLVER LA SEÑAL) SE REFRESCA LA LISTA DEL SERVIDOR
        const termino = this.estabaSincronizando && !estado.sincronizando;
        const volvioSenal = !this.estado.enLinea && estado.enLinea;
        this.estabaSincronizando = estado.sincronizando;
        this.estado = estado;
        if (termino || volvioSenal || !this.yaPidioServidor) {
          this.cargarServidor();
        }
        this.cd.detectChanges();
      }),
      this.seguridadService.necesitaClave.subscribe(falta => { this.necesitaClave = falta; this.cd.detectChanges(); }),
    );
    try {
      this.subscripciones.push(
        this.almacenLocal.observarBandejaCompleta().subscribe({
          next: lista => {
            this.bandeja = lista.map(r => this.aVista(r)).sort((a, b) => Number(b.rechazado) - Number(a.rechazado) || a.orden - b.orden);
            this.cargandoBandeja = false;
            this.cd.detectChanges();
          },
          error: () => { this.cargandoBandeja = false; this.cd.detectChanges(); },
        }),
      );
    } catch {
      this.cargandoBandeja = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  private aVista(r: RegistroBandeja): RegistroVista {
    return {
      orden: r.orden!,
      descripcion: r.descripcion,
      fecha: fechaHoraLocalLegible(r.fechaCreacion),
      icono: ICONO_POR_TIPO[r.tipo] ?? 'nube-subir',
      rechazado: r.estado === 'RECHAZADO',
      mensaje: r.mensaje ?? null,
    };
  }

  get pendientes(): RegistroVista[] {
    return this.bandeja.filter(r => !r.rechazado);
  }

  get rechazados(): RegistroVista[] {
    return this.bandeja.filter(r => r.rechazado);
  }

  get ultimaVez(): string {
    return this.estado.ultimaSincronizacion ? fechaHoraLocalLegible(this.estado.ultimaSincronizacion) : 'Nunca en este celular';
  }

  get puedeSincronizar(): boolean {
    return this.estado.enLinea && !this.estado.sincronizando && !this.necesitaClave;
  }

  //---------------------------------------------ACCIONES-------------------------------------------------------------------

  async sincronizarAhora(): Promise<void> {
    if (!this.puedeSincronizar) {
      return;
    }
    const pendientesAntes = this.estado.pendientes;
    const bien = await this.sincronizacion.sincronizar();
    if (bien) {
      const rechazados = this.sincronizacion.estado$.value.rechazados;
      if (rechazados > 0) {
        this.toast.warning(`Se sincronizó, pero ${rechazados} ${rechazados === 1 ? 'registro tiene' : 'registros tienen'} un problema. Míralo abajo.`, 'Atención', 5000, true, true, true);
      } else {
        this.toast.success(pendientesAntes > 0 ? 'Todo subió y quedó al día.' : 'Quedó al día con la finca.', 'Éxito', 5000, true, true, true);
      }
    } else {
      this.toast.danger(this.sincronizacion.estado$.value.error || 'No se pudo sincronizar. Lo registrado sigue en el celular.', 'Error', 5000, true, true, true);
    }
    this.cd.detectChanges();
  }

  async reintentar(registro: RegistroVista): Promise<void> {
    this.reintentando = registro.orden;
    this.cd.detectChanges();
    try {
      await this.almacenLocal.reintentar(registro.orden);
      if (this.puedeSincronizar) {
        await this.sincronizarAhora();
      } else {
        this.toast.info('Quedó en la fila para subir. Se envía cuando haya señal.', 'Listo', 5000, true, true, true);
      }
    } catch {
      this.toast.danger('No se pudo volver a poner en la fila.', 'Error', 5000, true, true, true);
    } finally {
      this.reintentando = null;
      this.cd.detectChanges();
    }
  }

  pedirDescartar(registro: RegistroVista): void {
    this.porDescartar = registro;
    this.cd.detectChanges();
  }

  cancelarDescartar(): void {
    if (!this.descartando) {
      this.porDescartar = null;
      this.cd.detectChanges();
    }
  }

  async confirmarDescartar(): Promise<void> {
    if (!this.porDescartar) {
      return;
    }
    this.descartando = true;
    this.cd.detectChanges();
    try {
      await this.almacenLocal.descartar(this.porDescartar.orden);
      this.toast.success('Registro descartado.', 'Éxito', 5000, true, true, true);
      this.porDescartar = null;
    } catch {
      this.toast.danger('No se pudo descartar.', 'Error', 5000, true, true, true);
    } finally {
      this.descartando = false;
      this.cd.detectChanges();
    }
  }

  //---------------------------------------------ULTIMAS SINCRONIZACIONES (CON SEÑAL)------------------------------------------

  cargarServidor(): void {
    const finca = this.fincaActual.actual;
    if (!finca || !this.estado.enLinea || this.necesitaClave || this.cargandoServidor) {
      return;
    }
    this.yaPidioServidor = true;
    this.cargandoServidor = true;
    this.errorServidor = '';
    this.sincronizacion.ObtenerSincronizaciones(finca.idFinca)
      .pipe(finalize(() => { this.cargandoServidor = false; this.cd.detectChanges(); }))
      .subscribe({
        next: respuesta => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            this.sincronizaciones = respuesta.DATOS.map(s => ({
              id: s.ID_SINCRONIZACION,
              fecha: fechaHoraLocalLegible(s.FECHA_SINCRONIZACION),
              persona: s.NOM_PERSONA || 'Alguien de la finca',
              guardados: Number(s.GUARDADOS_SINCRONIZACION) || 0,
              omitidos: Number(s.OMITIDOS_SINCRONIZACION) || 0,
              rechazados: Number(s.RECHAZADOS_SINCRONIZACION) || 0,
            }));
          } else if (respuesta.CODIGO === 404) {
            this.sincronizaciones = [];
          } else {
            this.errorServidor = respuesta.MENSAJE || 'No se pudo traer la lista del servidor';
          }
        },
        error: () => { this.errorServidor = 'No se pudo traer la lista del servidor'; },
      });
  }
}
