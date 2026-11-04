import { LOCALE_ID, NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { BrowserModule } from '@angular/platform-browser';


//import { NgToastModule } from 'ng-angular-popup'; este es el modulo de popup  npm install ng-angular-popup  https://www.npmjs.com/package/ng-angular-popup
import { NgToastModule } from 'ng-angular-popup';

//importacion para peticiones http
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { RutaNoEncontradaComponent } from './publico/errores/ruta-no-encontrada/ruta-no-encontrada.component';
import { SesionVencidaInterceptor } from './guardianes/sesion-vencida.interceptor';
import { CompartidoModule } from './compartido/compartido.module';

//FORMATO COLOMBIANO PARA FECHAS ("22 de mayo de 2003")
registerLocaleData(localeEsCo, 'es-CO');

@NgModule({
  declarations: [
    App,
    RutaNoEncontradaComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    RouterModule,
    NgToastModule,
    HttpClientModule,
    CompartidoModule

  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    //CIERRA LA SESION SOLA SI EL BACKEND YA NO ACEPTA EL TOKEN (EL BEARER LO SIGUE PONIENDO CADA SERVICIO)
    { provide: HTTP_INTERCEPTORS, useClass: SesionVencidaInterceptor, multi: true },
  ],
  bootstrap: [App]
})
export class AppModule { }
