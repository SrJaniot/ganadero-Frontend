import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { FincaActualService } from '../servicios/finca-actual.service';

//LAS PANTALLAS DEL CAMPO NECESITAN UNA FINCA ELEGIDA; SI NO HAY, SE VA A ELEGIRLA (O A CREARLA)
export const ValidarFincaGuard = () => {
  const fincaActual = inject(FincaActualService);
  const router = inject(Router);
  if (fincaActual.actual) {
    return true;
  }
  router.navigate(['/fincas']);
  return false;
};
