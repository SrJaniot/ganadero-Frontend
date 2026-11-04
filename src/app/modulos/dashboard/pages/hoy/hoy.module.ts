import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { HoyComponent } from './hoy.component';

//MENU 4 ¿QUE PASO HOY?
const routes: Routes = [
  { path: '', component: HoyComponent },
];

@NgModule({
  declarations: [HoyComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class HoyModule {}
