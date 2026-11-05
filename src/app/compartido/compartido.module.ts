import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Icono } from './icono/icono';
import { ConfirmarAccion } from './confirmar-accion/confirmar-accion';
import { PesosPipe } from './pesos.pipe';
import { ElegirAnimal } from './elegir-animal/elegir-animal';
import { GraficaBarras } from './grafica-barras/grafica-barras';
import { CodigoQr } from './codigo-qr/codigo-qr';

//PIEZAS QUE SE USAN EN VARIOS MODULOS: ICONOS, EL MODAL DE CONFIRMACION, EL PIPE DE PESOS ELEGIR UN ANIMAL (TODOS LOS EVENTOS) LA GRAFICA DE BARRAS (INDICADORES) Y EL CODIGO QR (CHAPETAS)
@NgModule({
  declarations: [Icono, ConfirmarAccion, PesosPipe, ElegirAnimal, GraficaBarras, CodigoQr],
  imports: [CommonModule, FormsModule],
  exports: [Icono, ConfirmarAccion, PesosPipe, ElegirAnimal, GraficaBarras, CodigoQr],
})
export class CompartidoModule {}
