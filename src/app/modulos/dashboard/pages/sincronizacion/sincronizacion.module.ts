import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { SincronizacionComponent } from './sincronizacion.component';

//MENU 8 SINCRONIZACION
const routes: Routes = [
  { path: '', component: SincronizacionComponent },
];

@NgModule({
  declarations: [SincronizacionComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class SincronizacionModule {}
