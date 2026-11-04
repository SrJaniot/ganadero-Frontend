import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { ListaAnimalesComponent } from './lista-animales.component';
import { NuevoAnimalComponent } from './nuevo-animal.component';
import { FichaAnimalComponent } from './ficha-animal.component';

//MENU 3 HATO
const routes: Routes = [
  { path: '', component: ListaAnimalesComponent },
  { path: 'nuevo', component: NuevoAnimalComponent, data: { titulo: 'Animal nuevo' } },
  { path: ':uuid', component: FichaAnimalComponent, data: { titulo: 'Ficha del animal' } },
];

@NgModule({
  declarations: [ListaAnimalesComponent, NuevoAnimalComponent, FichaAnimalComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class HatoModule {}
