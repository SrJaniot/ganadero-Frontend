import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RutaNoEncontradaComponent } from './publico/errores/ruta-no-encontrada/ruta-no-encontrada.component';

const routes: Routes = [

  //ENTRADA, REGISTRO DEL DUEÑO Y CERRAR SESION
  {
    path: 'seguridad',
    loadChildren: () => import('./modulos/seguridad/seguridad-module').then(m => m.SeguridadModule),
  },

  //ELEGIR O CREAR LA FINCA
  {
    path: 'fincas',
    loadChildren: () => import('./modulos/fincas/fincas.module').then(m => m.FincasModule),
  },

  //EL ADMINISTRADOR DE LA PLATAFORMA (FASE 5D: EL WHATSAPP). NO NECESITA FINCA
  {
    path: 'admin',
    loadChildren: () => import('./modulos/admin/admin.module').then(m => m.AdminModule),
  },

  //EL CAMPO (SIN SESION EL GUARDIAN LLEVA AL INGRESO; SIN FINCA, A ELEGIRLA)
  {
    path: 'app',
    loadChildren: () => import('./modulos/dashboard/dashboard-module').then(m => m.DashboardModule),
  },

  {
    path: '',
    redirectTo: 'app',
    pathMatch: 'full'
  },

  // RUTA NO ENCONTRADA TIENE QUE SER EL ULTIMO
  {
    path:'**',
    component: RutaNoEncontradaComponent,
  }

];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
