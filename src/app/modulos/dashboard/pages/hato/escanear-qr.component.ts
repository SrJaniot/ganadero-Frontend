import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { uuidDeEnlace } from '../../../../compartido/codigo-qr/codigo-qr';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';

//ESCANEAR EL QR DE UNA CHAPETA DESDE LA APP (FASE 5C). USA BarcodeDetector DEL NAVEGADOR (CHROME EN ANDROID): NO NECESITA SEÑAL
//SI EL NAVEGADOR NO LO TIENE, SE EXPLICA QUE SE PUEDE USAR LA CAMARA DEL CELULAR (ABRE EL MISMO ENLACE) O BUSCAR POR CHAPETA
@Component({
  selector: 'app-escanear-qr',
  standalone: false,
  templateUrl: './escanear-qr.component.html',
})
export class EscanearQrComponent implements AfterViewInit, OnDestroy {
  private router = inject(Router);
  private almacenLocal = inject(AlmacenLocalService);
  private cd = inject(ChangeDetectorRef);

  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;

  soportado = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  error = '';
  aviso = '';
  buscando = false;
  private flujo: MediaStream | null = null;
  private temporizador: ReturnType<typeof setInterval> | null = null;

  async ngAfterViewInit(): Promise<void> {
    if (!this.soportado) return;
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const v = this.video!.nativeElement;
      v.srcObject = this.flujo;
      await v.play();
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      this.buscando = true;
      this.cd.detectChanges();
      this.temporizador = setInterval(async () => {
        try {
          const codigos = await detector.detect(v);
          if (codigos?.length) await this.leido(codigos[0].rawValue);
        } catch { /* CUADRO SIN IMAGEN TODAVIA */ }
      }, 400);
    } catch {
      this.error = 'No se pudo abrir la cámara. Revisa que la app tenga permiso para usarla.';
      this.cd.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.apagar();
  }

  private apagar(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    this.flujo?.getTracks().forEach(t => t.stop());
    this.flujo = null;
  }

  //UN QR DE GANADERO ABRE LA FICHA SI EL ANIMAL ESTA EN ESTE CELULAR (EN LA FINCA ABIERTA)
  async leido(texto: string): Promise<void> {
    const uuid = uuidDeEnlace(texto);
    if (!uuid) {
      this.aviso = 'Ese código no es de una chapeta de Ganadero.';
      this.cd.detectChanges();
      return;
    }
    const animal = await this.almacenLocal.animalPorUuid(uuid);
    if (!animal) {
      this.aviso = 'Ese animal no está en esta finca (o todavía no ha bajado al celular).';
      this.cd.detectChanges();
      return;
    }
    this.apagar();
    this.router.navigate(['/app/hato', uuid]);
  }
}
