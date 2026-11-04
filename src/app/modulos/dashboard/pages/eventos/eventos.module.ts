import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { OrdenoComponent } from './ordeno.component';
import { VacunacionComponent } from './vacunacion.component';
import { ServicioComponent } from './servicio.component';
import { PalpacionComponent } from './palpacion.component';
import { PartoComponent } from './parto.component';
import { SalidaComponent } from './salida.component';

//LOS EVENTOS DE «¿QUE PASO HOY?» (MENU 4, GUARDAR). TODOS ACEPTAN ?animal=<uuid> PARA LLEGAR DESDE LA FICHA CON EL ANIMAL YA ELEGIDO
const routes: Routes = [
  { path: 'ordeno', component: OrdenoComponent, data: { titulo: 'Ordeñé' } },
  { path: 'vacunacion', component: VacunacionComponent, data: { titulo: 'Vacuné / Traté' } },
  { path: 'servicio', component: ServicioComponent, data: { titulo: 'Monta / Inseminación' } },
  { path: 'palpacion', component: PalpacionComponent, data: { titulo: 'Palpé' } },
  { path: 'parto', component: PartoComponent, data: { titulo: 'Parió' } },
  { path: 'salida', component: SalidaComponent, data: { titulo: 'Salió' } },
  { path: '', redirectTo: '/app/hoy', pathMatch: 'full' },
];

@NgModule({
  declarations: [OrdenoComponent, VacunacionComponent, ServicioComponent, PalpacionComponent, PartoComponent, SalidaComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class EventosModule {}
