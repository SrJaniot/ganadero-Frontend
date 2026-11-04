import { Component } from '@angular/core';
import { InstalarAppService } from './servicios/instalar-app.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
})
export class App {
  //SE CREA AL ARRANCAR PARA NO PERDER EL AVISO DE "SE PUEDE INSTALAR" QUE EL NAVEGADOR ENVIA UNA SOLA VEZ
  constructor(private instalarAppService: InstalarAppService) {}
}
