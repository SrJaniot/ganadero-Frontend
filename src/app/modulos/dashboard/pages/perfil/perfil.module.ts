import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { PerfilComponent } from './perfil.component';

//MENU 9 MI PERFIL
const routes: Routes = [
  { path: '', component: PerfilComponent },
];

@NgModule({
  declarations: [PerfilComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class PerfilModule {}
