import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SeguridadRoutingModule } from './seguridad-routing-module';

//imports para que mis formularios funcionen (formgroup, formbuilder, validators)
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CompartidoModule } from '../../compartido/compartido.module';
import { CerrarSesion } from './cerrar-sesion/cerrar-sesion';
import { Ingreso } from './ingreso/ingreso';
import { Registro } from './registro/registro';

@NgModule({
  declarations: [Ingreso, Registro, CerrarSesion],
  imports: [CommonModule, SeguridadRoutingModule, FormsModule, ReactiveFormsModule, CompartidoModule],
})
export class SeguridadModule {}
