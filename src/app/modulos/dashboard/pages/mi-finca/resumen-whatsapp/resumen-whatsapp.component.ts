import { ChangeDetectorRef, Component, inject, Input, OnInit } from '@angular/core';
import { NgToastService } from 'ng-angular-popup';
import { finalize } from 'rxjs';
import { ResumenWhatsappDTO } from '../../../../../Modelos/GanaderoModel';
import { WhatsappService } from '../../../../../servicios/whatsapp.service';
import { fechaHoraLocalLegible, fechaLegible } from '../../hato/hato-vista';

//TARJETA "RESUMEN POR WHATSAPP" DE MI FINCA (FASE 5D, SOLO EL DUEÑO): PEDIRLO O NO, VER EL TEXTO DE HOY Y MANDARSE UNO DE PRUEBA
//EL RESUMEN LO ARMA LA BASE CON LAS MISMAS ALERTAS DE "PARA HOY" (FUN_TEXTO_RESUMEN_WHATSAPP_JSON) Y LO MANDA EL SERVIDOR A SU HORA
@Component({
  selector: 'app-resumen-whatsapp',
  standalone: false,
  templateUrl: './resumen-whatsapp.component.html',
})
export class ResumenWhatsappComponent implements OnInit {
  @Input() idFinca = 0;
  private whatsappService = inject(WhatsappService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  errorCarga = '';
  resumen: ResumenWhatsappDTO | null = null;
  guardando = false;
  probando = false;
  verTexto = false;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.whatsappService.ObtenerResumenWhatsapp(this.idFinca)
      .pipe(finalize(() => { this.cargando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200 && r.DATOS) this.resumen = r.DATOS;
          else this.errorCarga = r.MENSAJE || 'No se pudo leer el resumen.';
        },
        error: () => this.errorCarga = 'No se pudo conectar con el servidor.',
      });
  }

  cambiar(activo: boolean): void {
    if (this.guardando) return;
    this.guardando = true;
    this.cd.detectChanges();
    this.whatsappService.CambiarResumenWhatsapp(this.idFinca, activo ? 'SI' : 'NO')
      .pipe(finalize(() => { this.guardando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200) {
            this.toast.success(r.MENSAJE || 'Guardado.', 'Éxito', 5000, true, true, true);
            this.cargar();
          } else {
            this.toast.warning(r.MENSAJE || 'No se pudo guardar.', 'Aviso', 5000, true, true, true);
          }
        },
        error: () => this.toast.danger('No se pudo conectar con el servidor.', 'Error', 5000, true, true, true),
      });
  }

  probar(): void {
    if (this.probando) return;
    this.probando = true;
    this.cd.detectChanges();
    this.whatsappService.ProbarResumenWhatsapp(this.idFinca)
      .pipe(finalize(() => { this.probando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200) this.toast.success(r.MENSAJE || 'Mensaje enviado.', 'Éxito', 5000, true, true, true);
          else this.toast.warning(r.MENSAJE || 'No se pudo mandar.', 'Aviso', 5000, true, true, true);
        },
        error: () => this.toast.danger('No se pudo conectar con el servidor.', 'Error', 5000, true, true, true),
      });
  }

  get textoUltimo(): string {
    const u = this.resumen?.ULTIMO;
    if (!u) return 'Todavía no te ha llegado ninguno.';
    switch (u.ESTADO_MENSAJE) {
      case 'ENVIADO': return `El último te llegó el ${u.FECHA_ENVIO_MENSAJE ? fechaHoraLocalLegible(u.FECHA_ENVIO_MENSAJE) : fechaLegible(u.FECHA_RESUMEN)}.`;
      case 'PENDIENTE': return `El del ${fechaLegible(u.FECHA_RESUMEN)} está por salir.`;
      case 'SIN_NUMERO': return 'El último no salió: tu cuenta no tiene un celular válido.';
      default: return `El del ${fechaLegible(u.FECHA_RESUMEN)} no se pudo mandar.`;
    }
  }
}
