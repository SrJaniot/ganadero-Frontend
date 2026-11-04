import { ChangeDetectorRef, Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { finalize } from 'rxjs';
import { RespuestaServer } from '../../../Modelos/RespuestaServer.model';
import { SeguridadService } from '../../../servicios/seguridad';

@Component({
  selector: 'app-ingreso',
  standalone: false,
  templateUrl: './ingreso.html',
})
export class Ingreso {

  //INGRESO A GANADERO: CELULAR Y CLAVE. EL DUEÑO NUEVO SE REGISTRA; LOS VAQUEROS RECIBEN SU CUENTA DEL DUEÑO
  ingresando = false;
  mostrarClave = false;
  errorIngreso = '';

  ingresoForm = new FormGroup({
    celular: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[\d\s+-]{10,16}$/)] }),
    clave: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor(
    private toast: NgToastService,
    private seguridadService: SeguridadService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {}

  campoInvalido(campo: keyof typeof this.ingresoForm.controls): boolean {
    const control = this.ingresoForm.controls[campo];
    return control.touched && control.invalid;
  }

  //PROCESO DE ENTRADA (EL BACKEND BLOQUEA LA CUENTA TRAS VARIOS INTENTOS FALLIDOS). DESPUES SE ELIGE O SE CREA LA FINCA
  entrar() {
    this.errorIngreso = '';
    if (this.ingresoForm.invalid) {
      this.ingresoForm.markAllAsTouched();
      return;
    }
    if (!navigator.onLine) {
      this.errorIngreso = 'Para entrar la primera vez se necesita señal. Después la app funciona sin ella';
      return;
    }
    const { celular, clave } = this.ingresoForm.getRawValue();
    this.ingresando = true;
    this.seguridadService.IdentificarUsuario(celular.trim(), clave)
      .pipe(finalize(() => { this.ingresando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServer) => {
          if (respuesta.CODIGO === 200) {
            if (this.seguridadService.AlmacenarDatosUsuarioIdentificadoSESION(respuesta)) {
              this.seguridadService.ConstruirMenuLateral(respuesta.DATOS.menu);
              this.toast.success(`Hola, ${respuesta.DATOS.usuario?.nombre ?? ''}`, 'Bienvenido', 4000, true, true, true);
              this.router.navigate(['/fincas']);
            }
          } else {
            this.errorIngreso = respuesta.MENSAJE || 'El celular o la contraseña no son correctos';
            this.ingresoForm.controls.clave.reset();
          }
        },
        error: () => {
          this.errorIngreso = 'No hay conexión con el servidor. Intenta de nuevo';
          this.toast.danger(this.errorIngreso, 'Error', 5000, true, true, true);
        }
      });
  }
}
