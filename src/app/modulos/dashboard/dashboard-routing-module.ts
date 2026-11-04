import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ValidarSesionActivaGuard } from '../../guardianes/validar-sesion-activa.guard';
import { ValidarFincaGuard } from '../../guardianes/validar-finca.guard';
import { DashboardLayoutComponent } from './layout/dashboard-layout.component';
import { EnConstruccionComponent } from './pages/en-construccion/en-construccion.component';
import { RutaNoEncontradaComponent } from '../../publico/errores/ruta-no-encontrada/ruta-no-encontrada.component';

//EL CAMPO: BARRA DE ARRIBA CON LA FINCA Y EL ESTADO DE LA SINCRONIZACION, BARRA DE ABAJO CON LOS MENUS DEL ROL
//data.titulo ES EL TITULO DE LA BARRA SUPERIOR; data.fase Y data.descripcion LOS USA "EN CONSTRUCCION"
//SEGURIDAD VISUAL: LA REAL ES EL @authenticate DE CADA ENDPOINT Y LAS REGLAS DE LA BASE
const routes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    canActivate: [ValidarSesionActivaGuard, ValidarFincaGuard],
    children: [
      { path: '', redirectTo: 'hoy', pathMatch: 'full' },
      {
        path: 'hoy',
        loadChildren: () => import('./pages/hoy/hoy.module').then(m => m.HoyModule),
        data: { titulo: '¿Qué pasó hoy?' }
      },
      {
        path: 'hato',
        loadChildren: () => import('./pages/hato/hato.module').then(m => m.HatoModule),
        data: { titulo: 'Hato' }
      },
      {
        path: 'pesar',
        loadChildren: () => import('./pages/pesar/pesar.module').then(m => m.PesarModule),
        data: { titulo: 'Pesé' }
      },
      {
        path: 'sincronizacion',
        loadChildren: () => import('./pages/sincronizacion/sincronizacion.module').then(m => m.SincronizacionModule),
        data: { titulo: 'Sincronizar' }
      },
      {
        path: 'finca',
        loadChildren: () => import('./pages/mi-finca/mi-finca.module').then(m => m.MiFincaModule),
        data: { titulo: 'Mi finca' }
      },
      {
        path: 'perfil',
        loadChildren: () => import('./pages/perfil/perfil.module').then(m => m.PerfilModule),
        data: { titulo: 'Mi perfil' }
      },
      {
        path: 'evento/:tipo',
        component: EnConstruccionComponent,
        data: { titulo: 'Pronto', fase: 2, descripcion: 'Ordeño, vacunas, servicios, partos y salidas llegan en la fase 2.' }
      },
      { path: '**', component: RutaNoEncontradaComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule { }
