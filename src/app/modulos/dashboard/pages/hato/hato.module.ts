import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { ListaAnimalesComponent } from './lista-animales.component';
import { NuevoAnimalComponent } from './nuevo-animal.component';
import { FichaAnimalComponent } from './ficha-animal.component';
import { LotesComponent } from './lotes.component';

//MENU 3 HATO (FASE 1: LOTES, EDITAR Y ANULAR, FOTO, MADRE Y PADRE)
const routes: Routes = [
  { path: '', component: ListaAnimalesComponent },
  { path: 'nuevo', component: NuevoAnimalComponent, data: { titulo: 'Animal nuevo' } },
  { path: 'lotes', component: LotesComponent, data: { titulo: 'Lotes' } },
  //EDITAR USA EL MISMO FORMULARIO DEL ANIMAL NUEVO (data.modo = 'editar'), SOLO EL DUEÑO
  { path: ':uuid/editar', component: NuevoAnimalComponent, data: { titulo: 'Editar animal', modo: 'editar' } },
  { path: ':uuid', component: FichaAnimalComponent, data: { titulo: 'Ficha del animal' } },
];

@NgModule({
  declarations: [ListaAnimalesComponent, NuevoAnimalComponent, FichaAnimalComponent, LotesComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class HatoModule {}
