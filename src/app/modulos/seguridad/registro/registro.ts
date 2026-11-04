import { ChangeDetectorRef, Component } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { finalize } from 'rxjs';
import { LONGITUD_MINIMA_CLAVE } from '../../../compartido/clave';
import { RespuestaServer } from '../../../Modelos/RespuestaServer.model';
import { SeguridadService } from '../../../servicios/seguridad';

//VALIDADOR: LAS DOS CLAVES DEBEN SER IGUALES
function validarClavesIguales(grupo: AbstractControl): ValidationErrors | null {
  const clave = grupo.get('clave')?.value;
  const confirmar = grupo.get('confirmar_clave')?.value;
  return clave && confirmar && clave !== confirmar ? { clavesDiferentes: true } : null;
}

//REGISTRO DEL DUEÑO (PUBLICO): NOMBRE, CELULAR Y CLAVE. DESPUES ENTRA SOLO Y VA A CREAR SU FINCA
@Component({
  selector: 'app-registro',
  standalone: false,
  templateUrl: './registro.html',
})
export class Registro {

  readonly longitudMinimaClave = LONGITUD_MINIMA_CLAVE;
  guardando = false;
  mostrarClave = false;
  errorRegistro = '';

  registroForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    celular: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[\d\s+-]{10,16}$/)] }),
    clave: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(LONGITUD_MINIMA_CLAVE)] }),
    confirmar_clave: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  }, { validators: [validarClavesIguales] });

  constructor(
    private toast: NgToastService,
    private seguridadService: SeguridadService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {}

  campoInvalido(campo: keyof typeof this.registroForm.controls): boolean {
    const control = this.registroForm.controls[campo];
    return control.touched && control.invalid;
  }

  get clavesDiferentes(): boolean {
    return this.registroForm.controls.confirmar_clave.touched && this.registroForm.hasError('clavesDiferentes');
  }

  //PASO 1: CREAR LA CUENTA. PASO 2: ENTRAR CON ESA MISMA CUENTA (IGUAL QUE EL INGRESO)
  registrar() {
    this.errorRegistro = '';
    if (this.registroForm.invalid) {
      this.registroForm.markAllAsTouched();
      return;
    }
    if (!navigator.onLine) {
      this.errorRegistro = 'Para crear la cuenta se necesita señal. Busca un lugar con señal e intenta de nuevo';
      return;
    }
    const { nombre, celular, clave } = this.registroForm.getRawValue();
    this.guardando = true;
    this.seguridadService.RegistrarDuenio(nombre.trim(), celular.trim(), clave)
      .subscribe({
        next: (respuesta: RespuestaServer) => {
          if (respuesta.CODIGO === 200) {
            this.entrar(celular.trim(), clave);
          } else {
            this.guardando = false;
            this.errorRegistro = respuesta.MENSAJE || 'No se pudo crear la cuenta';
            this.cd.detectChanges();
          }
        },
        error: () => {
          this.guardando = false;
          this.errorRegistro = 'No hay conexión con el servidor. Intenta de nuevo';
          this.toast.danger(this.errorRegistro, 'Error', 5000, true, true, true);
          this.cd.detectChanges();
        }
      });
  }

  private entrar(celular: string, clave: string) {
    this.seguridadService.IdentificarUsuario(celular, clave)
      .pipe(finalize(() => { this.guardando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServer) => {
          if (respuesta.CODIGO === 200) {
            if (this.seguridadService.AlmacenarDatosUsuarioIdentificadoSESION(respuesta)) {
              this.seguridadService.ConstruirMenuLateral(respuesta.DATOS.menu);
              this.toast.success('Tu cuenta quedó creada. Ahora crea tu finca', 'Bienvenido', 5000, true, true, true);
              this.router.navigate(['/fincas']);
            }
          } else {
            //LA CUENTA SI QUEDO CREADA: QUE ENTRE DESDE EL INGRESO
            this.toast.warning('Tu cuenta quedó creada. Entra con tu celular y tu clave', 'Atención', 6000, true, true, true);
            this.router.navigate(['/seguridad/ingreso']);
          }
        },
        error: () => {
          this.toast.warning('Tu cuenta quedó creada, pero se cayó la señal. Entra con tu celular y tu clave', 'Atención', 6000, true, true, true);
          this.router.navigate(['/seguridad/ingreso']);
        }
      });
  }
}
