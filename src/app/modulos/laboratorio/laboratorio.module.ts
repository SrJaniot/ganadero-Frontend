import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { LaboratorioComponent } from './laboratorio.component';

//LABORATORIO DE LA API (SOLO EN LA DEMO): PUBLICO A PROPOSITO, PORQUE EL PASO 1 ES INICIAR SESION
const routes: Routes = [
  { path: '', component: LaboratorioComponent },
];

@NgModule({
  declarations: [LaboratorioComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class LaboratorioModule {}
