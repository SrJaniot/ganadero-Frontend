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
        path: 'alertas',
        loadChildren: () => import('./pages/alertas/alertas.module').then(m => m.AlertasModule),
        data: { titulo: 'Para hoy' }
      },
      {
        path: 'indicadores',
        loadChildren: () => import('./pages/indicadores/indicadores.module').then(m => m.IndicadoresModule),
        data: { titulo: 'Indicadores' }
      },
      {
        path: 'hato',
        loadChildren: () => import('./pages/hato/hato.module').then(m => m.HatoModule),
        data: { titulo: 'Hato' }
      },
      {
        path: 'potreros',
        loadChildren: () => import('./pages/potreros/potreros.module').then(m => m.PotrerosModule),
        data: { titulo: 'Potreros' }
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
        path: 'evento',
        loadChildren: () => import('./pages/eventos/eventos.module').then(m => m.EventosModule),
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
