import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { PlataComponent } from './plata.component';

//PLATA DE LA FINCA (FASE 5B). PERMISO DEL MENU 2 MI FINCA (SOLO EL DUEÑO)
const routes: Routes = [
  { path: '', component: PlataComponent },
];

@NgModule({
  declarations: [PlataComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class PlataModule {}
