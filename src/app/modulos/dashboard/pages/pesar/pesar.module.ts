import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { PesarComponent } from './pesar.component';

//REGISTRAR UN PESAJE (MENU 4, GUARDAR)
const routes: Routes = [
  { path: '', component: PesarComponent },
];

@NgModule({
  declarations: [PesarComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class PesarModule {}
