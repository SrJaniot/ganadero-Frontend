import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ValidarSesionInactivaGuard } from '../../guardianes/validar-sesion-inactiva.guard';
import { CerrarSesion } from './cerrar-sesion/cerrar-sesion';
import { Ingreso } from './ingreso/ingreso';
import { Registro } from './registro/registro';

const routes: Routes = [

  //INGRESO CON CELULAR Y CLAVE
  {
    path: 'ingreso',
    component: Ingreso,
    canActivate: [ValidarSesionInactivaGuard]
  },
  //EL DUEÑO SE REGISTRA SOLO (LOS VAQUEROS LOS CREA EL DUEÑO EN MI FINCA)
  {
    path: 'registro',
    component: Registro,
    canActivate: [ValidarSesionInactivaGuard]
  },
  {
    path: 'cerrar-sesion',
    component: CerrarSesion,
  },
  //ruta por defecto: el ingreso
  {
    path: '**',
    redirectTo: 'ingreso'
  }

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SeguridadRoutingModule {}
