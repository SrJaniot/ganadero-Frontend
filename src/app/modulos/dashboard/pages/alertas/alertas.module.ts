import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { AlertasComponent } from './alertas.component';

//MENU 5 HOY Y ALERTAS
const routes: Routes = [
  { path: '', component: AlertasComponent },
];

@NgModule({
  declarations: [AlertasComponent],
  imports: [CommonModule, RouterModule.forChild(routes), CompartidoModule],
})
export class AlertasModule {}
