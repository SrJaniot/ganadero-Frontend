import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { DashboardRoutingModule } from './dashboard-routing-module';
import { CompartidoModule } from '../../compartido/compartido.module';
import { DashboardLayoutComponent } from './layout/dashboard-layout.component';
import { EnConstruccionComponent } from './pages/en-construccion/en-construccion.component';

@NgModule({
  declarations: [DashboardLayoutComponent, EnConstruccionComponent],
  imports: [CommonModule, DashboardRoutingModule, FormsModule, ReactiveFormsModule, CompartidoModule],
})
export class DashboardModule {}
