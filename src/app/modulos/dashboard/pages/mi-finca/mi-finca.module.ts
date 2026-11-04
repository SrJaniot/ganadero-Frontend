import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { MiFincaComponent } from './mi-finca.component';

//MENU 2 MI FINCA
const routes: Routes = [
  { path: '', component: MiFincaComponent },
];

@NgModule({
  declarations: [MiFincaComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class MiFincaModule {}
