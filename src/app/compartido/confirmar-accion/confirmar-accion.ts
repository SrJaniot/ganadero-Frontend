import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

//MODAL PARA CONFIRMAR UNA ACCION (DESACTIVAR UNA PERSONA, ETC.)
//SI palabra TIENE TEXTO, HAY QUE ESCRIBIRLA IGUAL PARA HABILITAR EL BOTON (EVITA UN CLIC EQUIVOCADO)
@Component({
  selector: 'app-confirmar-accion',
  standalone: false,
  templateUrl: './confirmar-accion.html',
})
export class ConfirmarAccion implements OnChanges {
  @Input() abierto = false;
  @Input() titulo = '';
  @Input() descripcion = '';
  @Input() aviso = '';
  @Input() palabra = '';
  @Input() textoBoton = 'Confirmar';
  @Input() peligroso = true;
  @Input() procesando = false;
  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  escrito = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['abierto'] && this.abierto) {
      this.escrito = '';
    }
  }

  get habilitado(): boolean {
    return !this.procesando && (!this.palabra || this.escrito.trim() === this.palabra);
  }

  @HostListener('document:keydown.escape')
  alPresionarEscape() {
    if (this.abierto && !this.procesando) {
      this.cancelar.emit();
    }
  }
}