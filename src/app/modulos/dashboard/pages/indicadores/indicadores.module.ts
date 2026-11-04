import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { IndicadoresComponent } from './indicadores.component';

//MENU 6 INDICADORES Y EXCEL (DUEÑO Y VETERINARIO)
const routes: Routes = [
  { path: '', component: IndicadoresComponent },
];

@NgModule({
  declarations: [IndicadoresComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class IndicadoresModule {}
