import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NgToastService } from 'ng-angular-popup';
import { LoteDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { HatoService } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';

type LoteConConteo = LoteDTO & { ANIMALES_ACTIVOS: number; _pendiente?: boolean };

//VIEWMODEL DE UN LOTE PARA LA LISTA
interface LoteVista {
  uuid: string;
  nombre: string;
  animales: number;
  pendiente: boolean;
}

//NOMBRE PARA COMPARAR: SIN ESPACIOS DE SOBRA Y SIN IMPORTAR MAYUSCULAS (COMO LA BASE)
function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLowerCase();
}

//LOTES DE LA FINCA (ORDEÑO, HORRAS, LEVANTE, CEBA...): CREAR (DUEÑO Y VAQUERO), RENOMBRAR Y ANULAR (DUEÑO). FUNCIONA SIN SEÑAL
//LAS REGLAS SON LAS DE FUN_TAB_LOTES (LA BASE LAS VUELVE A REVISAR AL SUBIR)
@Component({
  selector: 'app-lotes',
  standalone: false,
  templateUrl: './lotes.component.html',
})
export class LotesComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private hatoService = inject(HatoService);
  private fincaActual = inject(FincaActualService);
  private seguridadService = inject(SeguridadService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  errorCarga = false;
  guardando = false;
  anulando = false;
  lotes: LoteVista[] = [];
  puedeCrear = this.seguridadService.tienePermiso(3, 'guardar');
  esDuenio = this.fincaActual.esDuenio;

  errorNuevo = '';
  nuevoForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
  });

  //MODAL DE RENOMBRAR
  renombrando: LoteVista | null = null;
  errorRenombrar = '';
  renombrarForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
  });

  //CONFIRMAR ANULAR
  porAnular: LoteVista | null = null;

  private subscripcion: Subscription | null = null;

  ngOnInit(): void {
    try {
      this.subscripcion = this.almacenLocal.observarLotes().subscribe({
        next: lista => {
          this.lotes = (lista as LoteConConteo[]).map(l => ({
            uuid: l.UUID_LOTE, nombre: l.NOM_LOTE, animales: l.ANIMALES_ACTIVOS, pendiente: !!l._pendiente,
          }));
          this.cargando = false;
          this.cd.detectChanges();
        },
        error: () => { this.errorCarga = true; this.cargando = false; this.cd.detectChanges(); },
      });
    } catch {
      this.errorCarga = true;
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripcion?.unsubscribe();
  }

  //MISMAS REGLAS QUE LA BASE: OBLIGATORIO, MAXIMO 60 Y NO REPETIDO ENTRE LOS ACTIVOS
  private validarNombre(nombre: string, uuidPropio: string | null): string {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio || limpio.length > 60) {
      return 'Escribe el nombre del lote (máximo 60 caracteres)';
    }
    const comparar = normalizarNombre(limpio);
    if (this.lotes.some(l => l.uuid !== uuidPropio && normalizarNombre(l.nombre) === comparar)) {
      return 'Ya hay un lote con ese nombre';
    }
    return '';
  }

  async crear(): Promise<void> {
    if (this.guardando) {
      return;
    }
    const nombre = this.nuevoForm.controls.nombre.value;
    this.errorNuevo = this.validarNombre(nombre, null);
    if (this.errorNuevo) {
      this.cd.detectChanges();
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.hatoService.crearLote(nombre);
      this.toast.success(`Listo: el lote «${nombre.trim().replace(/\s+/g, ' ')}» quedó creado. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
      this.nuevoForm.reset();
    } catch {
      this.toast.danger('No se pudo guardar el lote en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  abrirRenombrar(lote: LoteVista): void {
    this.renombrando = lote;
    this.errorRenombrar = '';
    this.renombrarForm.setValue({ nombre: lote.nombre });
  }

  cerrarRenombrar(): void {
    if (!this.guardando) {
      this.renombrando = null;
    }
  }

  async guardarNombre(): Promise<void> {
    const lote = this.renombrando;
    if (!lote || this.guardando) {
      return;
    }
    const nombre = this.renombrarForm.controls.nombre.value;
    this.errorRenombrar = this.validarNombre(nombre, lote.uuid);
    if (this.errorRenombrar) {
      this.cd.detectChanges();
      return;
    }
    if (nombre.trim().replace(/\s+/g, ' ') === lote.nombre) {
      this.renombrando = null;
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.hatoService.renombrarLote(lote.uuid, nombre);
      this.toast.success('Listo: el lote quedó con su nombre nuevo.', 'Éxito', 5000, true, true, true);
      this.renombrando = null;
    } catch {
      this.toast.danger('No se pudo cambiar el nombre en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  pedirAnular(lote: LoteVista): void {
    this.porAnular = lote;
  }

  get descripcionAnular(): string {
    const l = this.porAnular;
    if (!l) {
      return '';
    }
    return l.animales > 0
      ? `Sus ${l.animales} ${l.animales === 1 ? 'animal queda' : 'animales quedan'} sin lote, pero siguen en el hato.`
      : 'El lote no tiene animales. Deja de salir en la lista.';
  }

  async anular(): Promise<void> {
    const lote = this.porAnular;
    if (!lote || this.anulando) {
      return;
    }
    this.anulando = true;
    this.cd.detectChanges();
    try {
      await this.hatoService.anularLote(lote.uuid, lote.nombre);
      this.toast.success(`Listo: el lote «${lote.nombre}» quedó anulado.`, 'Éxito', 5000, true, true, true);
      this.porAnular = null;
    } catch {
      this.toast.danger('No se pudo anular el lote en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.anulando = false;
      this.cd.detectChanges();
    }
  }
}
