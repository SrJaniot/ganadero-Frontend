import { ChangeDetectorRef, Component, inject, Input, OnChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

//EL ENLACE QUE LLEVA EL QR DE LA CHAPETA: ABRE LA FICHA DEL ANIMAL EN LA APP (FASE 5C). SIN SEÑAL TAMBIEN, SI LA APP ESTA INSTALADA
export function enlaceAnimal(uuid: string): string {
  return `${location.origin}/app/hato/${uuid}`;
}

//DEL TEXTO LEIDO DE UN QR SACA EL UUID DEL ANIMAL (SOLO SI ES UN ENLACE /app/hato/<uuid>); NULL SI NO ES DE GANADERO
export function uuidDeEnlace(texto: string): string | null {
  const m = /\/app\/hato\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(texto ?? '');
  return m ? m[1].toLowerCase() : null;
}

//DIBUJA UN QR EN SVG CON LA LIBRERIA qrcode (VA DENTRO DE LA APP: FUNCIONA SIN SEÑAL). NEGRO SOBRE BLANCO PARA QUE LO LEA CUALQUIER CAMARA
//qrcode ES COMMONJS: EN EL BUILD DE PRODUCCION LLEGA EN .default (APRENDIZAJES 2.1)
//USO: <app-codigo-qr [texto]="enlace" [tamano]="220" />
@Component({
  selector: 'app-codigo-qr',
  standalone: false,
  template: `<span class="block bg-white rounded-xl p-2 leading-none" [style.width.px]="tamano" [style.height.px]="tamano" role="img"
    [attr.aria-label]="etiqueta || 'Código QR'" [innerHTML]="svg" data-qr></span>`,
})
export class CodigoQr implements OnChanges {
  @Input() texto = '';
  @Input() tamano = 200;
  @Input() etiqueta = '';
  svg: SafeHtml = '';
  private sanitizer = inject(DomSanitizer);
  private cd = inject(ChangeDetectorRef);

  async ngOnChanges(): Promise<void> {
    if (!this.texto) {
      this.svg = '';
      return;
    }
    const m: any = await import('qrcode');
    const QR = m.default ?? m;
    //EL SVG LO GENERA LA LIBRERIA CON UN TEXTO NUESTRO (EL ENLACE): ES SEGURO MOSTRARLO TAL CUAL
    const svg: string = await QR.toString(this.texto, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#000000', light: '#FFFFFF' } });
    this.svg = this.sanitizer.bypassSecurityTrustHtml(svg.replace('<svg ', '<svg width="100%" height="100%" '));
    this.cd.detectChanges();
  }
}
