import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { finalize, Subscription } from 'rxjs';
import { LONGITUD_MINIMA_CLAVE } from '../../../../compartido/clave';
import { NOMBRE_ROL_FINCA } from '../../../../Modelos/GanaderoModel';
import { RespuestaServer } from '../../../../Modelos/RespuestaServer.model';
import { RespuestaServerSinDATA } from '../../../../Modelos/RespuestaServerSinDATA.model';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { InstalarAppService } from '../../../../servicios/instalar-app.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { EstadoSincronizacion, SincronizacionService } from '../../../../servicios/sincronizacion.service';

//VALIDADOR: LAS DOS CLAVES NUEVAS DEBEN SER IGUALES
function validarClavesIguales(grupo: AbstractControl): ValidationErrors | null {
  const clave = grupo.get('clave_nueva')?.value;
  const confirmar = grupo.get('confirmar_clave')?.value;
  return clave && confirmar && clave !== confirmar ? { clavesDiferentes: true } : null;
}

//MI PERFIL: NOMBRE, CORREO OPCIONAL, CAMBIAR CLAVE, CAMBIAR DE FINCA, INSTALAR LA APP Y CERRAR SESION
//EL CELULAR NO SE CAMBIA AQUI (CON EL ENTRA A LA APP)
@Component({
  selector: 'app-perfil',
  standalone: false,
  templateUrl: './perfil.component.html',
})
export class PerfilComponent implements OnInit, OnDestroy {

  readonly longitudMinimaClave = LONGITUD_MINIMA_CLAVE;
  guardandoPerfil = false;
  guardandoClave = false;
  mostrarClaves = false;
  verPasosIphone = false;
  estado: EstadoSincronizacion | null = null;
  private suscripcion: Subscription | null = null;

  perfilForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    correo: new FormControl('', { nonNullable: true, validators: [Validators.email, Validators.maxLength(150)] }),
  });

  claveForm = new FormGroup({
    clave_actual: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    clave_nueva: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(LONGITUD_MINIMA_CLAVE)] }),
    confirmar_clave: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  }, { validators: [validarClavesIguales] });

  constructor(
    private seguridadService: SeguridadService,
    private fincaActual: FincaActualService,
    private sincronizacion: SincronizacionService,
    public instalarAppService: InstalarAppService,
    private toast: NgToastService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargarPerfil();
    this.suscripcion = this.sincronizacion.estado$.subscribe(estado => {
      this.estado = estado;
      this.cd.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  private cargarPerfil() {
    const usuario = this.seguridadService.ObtenerDatosUsuarioIdentificadoSESION()?.usuario;
    this.perfilForm.reset({ nombre: usuario?.nombre ?? '', correo: usuario?.correo ?? '' });
  }

  get celular(): string {
    return this.seguridadService.ObtenerDatosUsuarioIdentificadoSESION()?.usuario?.celular ?? '';
  }

  get nombreFinca(): string {
    return this.fincaActual.actual?.nombre ?? '';
  }

  get rolFinca(): string {
    const rol = this.fincaActual.actual?.rol;
    return rol ? (NOMBRE_ROL_FINCA[rol] ?? rol) : '';
  }

  //VERSION CORTA DEL ESTADO (LA LARGA ESTA EN SINCRONIZAR)
  get textoEstado(): string {
    const e = this.estado;
    if (!e) {
      return '';
    }
    if (e.sincronizando) {
      return 'Sincronizando...';
    }
    if (!e.enLinea) {
      return e.pendientes > 0 ? `Sin señal · ${e.pendientes} por subir` : 'Sin señal';
    }
    if (e.pendientes > 0) {
      return `${e.pendientes} por subir`;
    }
    if (e.rechazados > 0) {
      return `${e.rechazados} con problema`;
    }
    return 'Todo guardado';
  }

  get claseEstado(): string {
    const e = this.estado;
    if (!e || e.sincronizando) {
      return 'badge-info';
    }
    if (e.rechazados > 0 || e.error) {
      return 'badge-danger';
    }
    if (!e.enLinea || e.pendientes > 0) {
      return 'badge-warning';
    }
    return 'badge-success';
  }

  get clavesDiferentes(): boolean {
    return this.claveForm.controls.confirmar_clave.touched && this.claveForm.hasError('clavesDiferentes');
  }

  campoInvalido(campo: keyof typeof this.perfilForm.controls): boolean {
    const control = this.perfilForm.controls[campo];
    return control.touched && control.invalid;
  }

  campoClaveInvalido(campo: keyof typeof this.claveForm.controls): boolean {
    const control = this.claveForm.controls[campo];
    return control.touched && control.invalid;
  }

  private haySenal(): boolean {
    if (navigator.onLine) {
      return true;
    }
    this.toast.warning('Para esto se necesita señal', 'Sin señal', 5000, true, true, true);
    return false;
  }

  guardarPerfil() {
    if (this.perfilForm.invalid) {
      this.perfilForm.markAllAsTouched();
      return;
    }
    if (!this.haySenal()) {
      return;
    }
    const datos = this.perfilForm.getRawValue();
    const nombre = datos.nombre.trim();
    const correo = datos.correo.trim() === '' ? null : datos.correo.trim();
    this.guardandoPerfil = true;
    this.seguridadService.ActualizarMiPerfil(nombre, correo)
      .pipe(finalize(() => { this.guardandoPerfil = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServer) => {
          if (respuesta.CODIGO === 200) {
            this.toast.success(respuesta.MENSAJE || 'Tus datos quedaron guardados', 'Éxito', 5000, true, true, true);
            this.seguridadService.ActualizarUsuarioEnSesion({
              nombre: respuesta.DATOS?.nombre ?? nombre,
              correo: respuesta.DATOS ? (respuesta.DATOS.correo ?? null) : correo,
            });
            this.cargarPerfil();
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudieron guardar tus datos', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  guardarClave() {
    if (this.claveForm.invalid) {
      this.claveForm.markAllAsTouched();
      return;
    }
    if (!this.haySenal()) {
      return;
    }
    const datos = this.claveForm.getRawValue();
    this.guardandoClave = true;
    this.seguridadService.CambiarClave(datos.clave_actual, datos.clave_nueva)
      .pipe(finalize(() => { this.guardandoClave = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerSinDATA) => {
          if (respuesta.CODIGO === 200) {
            this.toast.success(respuesta.MENSAJE || 'Tu clave quedó cambiada', 'Éxito', 5000, true, true, true);
            this.claveForm.reset();
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo cambiar la clave', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  cambiarDeFinca() {
    this.router.navigate(['/fincas']);
  }

  cerrarSesion() {
    this.router.navigate(['/seguridad/cerrar-sesion']);
  }

  async instalarApp() {
    await this.instalarAppService.instalar();
    this.cd.detectChanges();
  }
}
