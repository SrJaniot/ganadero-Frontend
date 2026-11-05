import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../compartido/compartido.module';
import { ValidarSesionActivaGuard } from '../../guardianes/validar-sesion-activa.guard';
import { WhatsappAdminComponent } from './whatsapp/whatsapp-admin.component';

//PANTALLAS DEL ADMINISTRADOR DE LA PLATAFORMA (SIN FINCA). LA PRIMERA ES LA DEL WHATSAPP (FASE 5D, MENU 7)
//SEGURIDAD VISUAL: LA REAL ES EL @authenticate DE CADA ENDPOINT
const routes: Routes = [
  { path: '', redirectTo: 'whatsapp', pathMatch: 'full' },
  { path: 'whatsapp', component: WhatsappAdminComponent, canActivate: [ValidarSesionActivaGuard] },
];

@NgModule({
  declarations: [WhatsappAdminComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class AdminModule {}
