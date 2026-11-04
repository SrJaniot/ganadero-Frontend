import { Component, Input } from '@angular/core';

//ICONOS DE GANADERO (24 x 24). USO: <app-icono nombre="casa" clase="w-5 h-5" />
@Component({
  selector: 'app-icono',
  standalone: false,
  templateUrl: './icono.html',
})
export class Icono {
  @Input() nombre = '';
  @Input() clase = 'w-5 h-5';
}
