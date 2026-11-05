import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NgToastService } from 'ng-angular-popup';
import { finalize } from 'rxjs';
import { EstadoWhatsappDTO } from '../../../Modelos/GanaderoModel';
import { SeguridadService } from '../../../servicios/seguridad';
import { WhatsappService } from '../../../servicios/whatsapp.service';

//WHATSAPP DE LA PLATAFORMA (FASE 5D, ADMINISTRADOR, MENU 7 EDITAR): VINCULAR EL NUMERO QUE MANDA CON EL QR, LA INSTANCIA, LA HORA DEL
//RESUMEN Y EL INTERRUPTOR PARA TODOS. RECETA DE DOCUMENTACION_WHATSAPP.md (6b): AL RECIBIR EL QR SE CONSULTA EL ESTADO CADA 3 S HASTA open
@Component({
  selector: 'app-whatsapp-admin',
  standalone: false,
  templateUrl: './whatsapp-admin.component.html',
})
export class WhatsappAdminComponent implements OnInit, OnDestroy {
  private whatsappService = inject(WhatsappService);
  private seguridadService = inject(SeguridadService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puede = this.seguridadService.tienePermiso(7, 'editar');
  cargando = true;
  errorCarga = '';
  estado: EstadoWhatsappDTO | null = null;

  //VINCULAR
  generandoQr = false;
  qrWhatsapp: string | null = null;
  codigoVinculacion: string | null = null;
  private consulta: ReturnType<typeof setInterval> | null = null;
  confirmarDesconectar = false;
  desconectando = false;

  //CONFIGURACION
  instancia = '';
  hora = '06:00';
  activo = false;
  guardando = false;
  enviando = false;
  resultadoEnvio = '';

  ngOnInit(): void {
    if (this.puede) this.cargar();
  }

  ngOnDestroy(): void {
    this.pararConsulta();
  }

  get vinculado(): boolean {
    return this.estado?.estado === 'open';
  }

  cargar(silencioso = false): void {
    if (!silencioso) {
      this.cargando = true;
      this.errorCarga = '';
    }
    this.whatsappService.ObtenerEstadoWhatsapp()
      .pipe(finalize(() => { this.cargando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200 && r.DATOS) {
            const antes = this.vinculado;
            this.estado = r.DATOS;
            if (!silencioso) {
              this.instancia = r.DATOS.INSTANCIA;
              this.hora = r.DATOS.HORA;
              this.activo = r.DATOS.ACTIVO;
            }
            //SE VINCULO MIENTRAS SE MOSTRABA EL QR
            if (this.qrWhatsapp && this.vinculado && !antes) {
              this.pararConsulta();
              this.qrWhatsapp = null;
              this.toast.success('WhatsApp vinculado. Manda una prueba desde «Mi finca» y prende el envío.', 'Éxito', 5000, true, true, true);
            }
          } else if (!silencioso) {
            this.errorCarga = r.MENSAJE || 'No se pudo leer el estado de WhatsApp.';
          }
        },
        error: () => { if (!silencioso) this.errorCarga = 'No se pudo conectar con el servidor.'; },
      });
  }

  generarQr(): void {
    if (this.generandoQr) return;
    this.generandoQr = true;
    this.cd.detectChanges();
    this.whatsappService.ConectarWhatsapp()
      .pipe(finalize(() => { this.generandoQr = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200 && r.DATOS) {
            this.qrWhatsapp = r.DATOS.QR;
            this.codigoVinculacion = r.DATOS.CODIGO_VINCULACION;
            this.pararConsulta();
            this.consulta = setInterval(() => this.cargar(true), 3000);
          } else {
            this.toast.warning(r.MENSAJE || 'No se pudo generar el QR.', 'Aviso', 5000, true, true, true);
            this.cargar(true);
          }
        },
        error: () => this.toast.danger('No se pudo conectar con el servidor.', 'Error', 5000, true, true, true),
      });
  }

  cancelarQr(): void {
    this.pararConsulta();
    this.qrWhatsapp = null;
    this.cd.detectChanges();
  }

  private pararConsulta(): void {
    if (this.consulta) clearInterval(this.consulta);
    this.consulta = null;
  }

  desconectar(): void {
    this.desconectando = true;
    this.cd.detectChanges();
    this.whatsappService.DesconectarWhatsapp()
      .pipe(finalize(() => { this.desconectando = false; this.confirmarDesconectar = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200) this.toast.success(r.MENSAJE || 'WhatsApp desconectado.', 'Éxito', 5000, true, true, true);
          else this.toast.warning(r.MENSAJE || 'No se pudo desconectar.', 'Aviso', 5000, true, true, true);
          this.cargar(true);
        },
        error: () => this.toast.danger('No se pudo conectar con el servidor.', 'Error', 5000, true, true, true),
      });
  }

  guardar(): void {
    if (this.guardando) return;
    this.guardando = true;
    this.cd.detectChanges();
    this.whatsappService.GuardarConfigWhatsapp(this.instancia.trim(), this.hora, this.activo ? 'SI' : 'NO')
      .pipe(finalize(() => { this.guardando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          if (r.CODIGO === 200) {
            this.toast.success(r.MENSAJE || 'Guardado.', 'Éxito', 5000, true, true, true);
            this.cargar(true);
          } else {
            this.toast.warning(r.MENSAJE || 'No se pudo guardar.', 'Aviso', 5000, true, true, true);
          }
        },
        error: () => this.toast.danger('No se pudo conectar con el servidor.', 'Error', 5000, true, true, true),
      });
  }

  enviarYa(): void {
    if (this.enviando) return;
    this.enviando = true;
    this.resultadoEnvio = '';
    this.cd.detectChanges();
    this.whatsappService.EnviarResumenesWhatsapp()
      .pipe(finalize(() => { this.enviando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: r => {
          this.resultadoEnvio = r.MENSAJE ?? '';
          if (r.CODIGO !== 200) this.toast.warning(r.MENSAJE || 'No se mandaron.', 'Aviso', 5000, true, true, true);
          this.cargar(true);
        },
        error: () => this.toast.danger('No se pudo conectar con el servidor.', 'Error', 5000, true, true, true),
      });
  }
}
