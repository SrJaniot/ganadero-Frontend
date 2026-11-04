import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Icono } from './icono/icono';
import { ConfirmarAccion } from './confirmar-accion/confirmar-accion';
import { PesosPipe } from './pesos.pipe';
import { ElegirAnimal } from './elegir-animal/elegir-animal';

//PIEZAS QUE SE USAN EN VARIOS MODULOS: ICONOS, EL MODAL DE CONFIRMACION, EL PIPE DE PESOS Y ELEGIR UN ANIMAL (TODOS LOS EVENTOS)
@NgModule({
  declarations: [Icono, ConfirmarAccion, PesosPipe, ElegirAnimal],
  imports: [CommonModule, FormsModule],
  exports: [Icono, ConfirmarAccion, PesosPipe, ElegirAnimal],
})
export class CompartidoModule {}
