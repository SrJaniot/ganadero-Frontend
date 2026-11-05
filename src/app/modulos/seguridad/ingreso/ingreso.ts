import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
export class Ingreso implements OnInit {

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

  //DEMO: BOTONES DE ENTRADA RAPIDA (SOLO SI ms-seguridad DICE QUE ESTE SITIO ES LA DEMO)
  esDemo = false;
  entrandoDemo: string | null = null;
  readonly cuentasDemo: { rol: 'DUENIO' | 'VAQUERO' | 'VETERINARIO'; texto: string; detalle: string }[] = [
    { rol: 'DUENIO', texto: 'Entrar como dueño', detalle: 'Ve todo: indicadores, plata, personas y corrige' },
    { rol: 'VAQUERO', texto: 'Entrar como vaquero', detalle: 'Registra lo del potrero: ordeños, pesajes, partos' },
    { rol: 'VETERINARIO', texto: 'Entrar como veterinario', detalle: 'Sanidad, reproducción e indicadores' },
  ];

  ngOnInit(): void {
    if (!navigator.onLine) return;
    this.seguridadService.DemoActiva().subscribe({
      next: r => { this.esDemo = r.CODIGO === 200 && !!r.DATOS?.activa; this.cd.detectChanges(); },
      error: () => { /* SIN SEÑAL O SIN SERVIDOR: SIN BOTONES */ },
    });
  }

  entrarDemo(rol: 'DUENIO' | 'VAQUERO' | 'VETERINARIO'): void {
    if (this.entrandoDemo) return;
    this.entrandoDemo = rol;
    this.errorIngreso = '';
    this.seguridadService.EntrarDemo(rol)
      .pipe(finalize(() => { this.entrandoDemo = null; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServer) => {
          if (respuesta.CODIGO === 200 && this.seguridadService.AlmacenarDatosUsuarioIdentificadoSESION(respuesta)) {
            this.seguridadService.ConstruirMenuLateral(respuesta.DATOS.menu);
            this.toast.success(`Hola, ${respuesta.DATOS.usuario?.nombre ?? ''}`, 'Bienvenido a la demo', 4000, true, true, true);
            this.router.navigate(['/fincas']);
          } else {
            this.errorIngreso = respuesta.MENSAJE || 'No se pudo entrar a la demo';
          }
        },
        error: () => { this.errorIngreso = 'No hay conexión con el servidor. Intenta de nuevo'; },
      });
  }

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
