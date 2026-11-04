import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

//PANTALLA TEMPORAL DE LO QUE LLEGA EN FASES SIGUIENTES (QUE MOSTRARA Y EN QUE FASE)
@Component({
  selector: 'app-en-construccion',
  standalone: false,
  templateUrl: './en-construccion.component.html',
})
export class EnConstruccionComponent {
  private route = inject(ActivatedRoute);

  get titulo(): string {
    return this.route.snapshot.data['titulo'] ?? '';
  }

  get fase(): number {
    return this.route.snapshot.data['fase'] ?? 0;
  }

  get descripcion(): string {
    return this.route.snapshot.data['descripcion'] ?? '';
  }
}