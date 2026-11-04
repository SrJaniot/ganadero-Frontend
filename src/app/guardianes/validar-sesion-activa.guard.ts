import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SeguridadService } from '../servicios/seguridad';


//SIN SESION SE MUESTRA EL INGRESO
export const ValidarSesionActivaGuard = () => {

  const servicioSeguridad = inject(SeguridadService);
  const router = inject(Router);

  let existeSesion = servicioSeguridad.validacionDeSesion();
    if (existeSesion) {
      return true;
    }
    router.navigate(["/seguridad/ingreso"]);
    return false;
}
