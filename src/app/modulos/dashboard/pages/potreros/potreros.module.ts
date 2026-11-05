import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { PotrerosComponent } from './potreros.component';
import { PotreroFormComponent } from './potrero-form.component';
import { PotreroDetalleComponent } from './potrero-detalle.component';
import { MapaPotreroComponent } from './mapa-potrero.component';

//POTREROS Y ROTACION (FASE 5A). PERMISOS DEL MENU 3 HATO: LISTAR PARA VER, GUARDAR PARA CREAR Y MOVER; EDITAR Y ANULAR SOLO EL DUEÑO
const routes: Routes = [
  { path: '', component: PotrerosComponent },
  { path: 'nuevo', component: PotreroFormComponent, data: { titulo: 'Potrero nuevo' } },
  { path: ':uuid/editar', component: PotreroFormComponent, data: { titulo: 'Editar potrero', modo: 'editar' } },
  { path: ':uuid', component: PotreroDetalleComponent, data: { titulo: 'Potrero' } },
];

@NgModule({
  declarations: [PotrerosComponent, PotreroFormComponent, PotreroDetalleComponent, MapaPotreroComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class PotrerosModule {}
