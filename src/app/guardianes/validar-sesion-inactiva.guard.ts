import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SeguridadService } from '../servicios/seguridad';
import { NgToastService } from 'ng-angular-popup';


export const ValidarSesionInactivaGuard = () => {

  const servicioSeguridad = inject(SeguridadService);
  const router = inject(Router);
  const toast = inject(NgToastService);

  let existeSesion = servicioSeguridad.validacionDeSesion();
    if (existeSesion) {
      //CON SESION ABIERTA NO SE MUESTRA EL INGRESO: SE VA AL CAMPO
      router.navigate(["/app/hoy"]);
      toast.info('Ya tienes una sesión activa','Información', 5000,true,true,true);
      return false;
    }
    return true;
}
