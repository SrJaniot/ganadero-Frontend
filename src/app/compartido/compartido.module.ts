import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Icono } from './icono/icono';
import { ConfirmarAccion } from './confirmar-accion/confirmar-accion';
import { PesosPipe } from './pesos.pipe';

//PIEZAS QUE SE USAN EN VARIOS MODULOS: ICONOS, EL MODAL DE CONFIRMACION Y EL PIPE DE PESOS (VENTAS, FASE 2)
@NgModule({
  declarations: [Icono, ConfirmarAccion, PesosPipe],
  imports: [CommonModule, FormsModule],
  exports: [Icono, ConfirmarAccion, PesosPipe],
})
export class CompartidoModule {}
