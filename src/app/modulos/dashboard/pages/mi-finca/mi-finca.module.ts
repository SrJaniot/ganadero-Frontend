import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../../../compartido/compartido.module';
import { ResumenWhatsappComponent } from './resumen-whatsapp/resumen-whatsapp.component';
import { MiFincaComponent } from './mi-finca.component';

//MENU 2 MI FINCA
const routes: Routes = [
  { path: '', component: MiFincaComponent },
];

@NgModule({
  declarations: [MiFincaComponent, ResumenWhatsappComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class MiFincaModule {}
