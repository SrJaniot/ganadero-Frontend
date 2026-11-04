import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CompartidoModule } from '../../compartido/compartido.module';
import { ValidarSesionActivaGuard } from '../../guardianes/validar-sesion-activa.guard';
import { ElegirFincaComponent } from './elegir-finca/elegir-finca.component';

//ELEGIR O CREAR LA FINCA, ANTES DE ENTRAR AL CAMPO
const routes: Routes = [
  { path: '', component: ElegirFincaComponent, canActivate: [ValidarSesionActivaGuard] },
];

@NgModule({
  declarations: [ElegirFincaComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), CompartidoModule],
})
export class FincasModule {}
