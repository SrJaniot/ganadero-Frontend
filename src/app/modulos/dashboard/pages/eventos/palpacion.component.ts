import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { AnimalDTO, PalpacionDTO, PartoDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { DatosPalpacion, EventosService } from '../../../../servicios/eventos.service';
import { ahoraLocal, categoriaAnimal, etiquetaAnimal } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { fechaLegible } from '../hato/hato-vista';
import { eraTernera, sumarMeses, validarFechaEvento } from './reglas-eventos';

type Resultado = 'PRENIADA' | 'VACIA';
type CampoError = 'animal' | 'resultado' | 'meses' | 'fecha' | 'nota';

//PALPE: LA HEMBRA (NO TERNERA), PREÑADA CON LOS MESES (1 A 9) O VACIA. CON PREÑADA SE MUESTRA EL PARTO APROXIMADO
//LAS REGLAS SON LAS DE FUN_VALIDAR_PALPACIONES Y FUN_VALIDAR_EVENTO_ANIMAL. SE GUARDA EN EL CELULAR Y VA A LA BANDEJA
@Component({
  selector: 'app-palpacion',
  standalone: false,
  templateUrl: './palpacion.component.html',
})
export class PalpacionComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private eventosService = inject(EventosService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puedeRegistrar = this.seguridadService.tienePermiso(4, 'guardar');
  guardando = false;
  uuidInicial: string | null = null;
  errores: Partial<Record<CampoError, string>> = {};
  readonly listaMeses = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  hembra: AnimalDTO | null = null;
  resultado: Resultado | null = null;
  meses: number | null = null;
  private palpacionesHembra: PalpacionDTO[] = [];
  private partosHembra: PartoDTO[] = [];
  private subsHembra: Subscription | null = null;

  guardado: { uuidAnimal: string; texto: string; partoAproximado: string | null } | null = null;

  form = new FormGroup({
    fecha: new FormControl(ahoraLocal(), { nonNullable: true }),
    nota: new FormControl('', { nonNullable: true }),
  });

  readonly motivoHembra = (animal: AnimalDTO): string | null =>
    categoriaAnimal(animal) === 'TERNERA' ? 'Es una ternera: todavía no se palpa' : null;

  ngOnInit(): void {
    this.uuidInicial = this.route.snapshot.queryParamMap.get('animal');
  }

  ngOnDestroy(): void {
    this.subsHembra?.unsubscribe();
  }

  get ahora(): string {
    return ahoraLocal();
  }

  alElegirHembra(animal: AnimalDTO | null): void {
    this.hembra = animal;
    this.palpacionesHembra = [];
    this.partosHembra = [];
    delete this.errores.animal;
    this.subsHembra?.unsubscribe();
    this.subsHembra = null;
    if (animal) {
      try {
        this.subsHembra = this.almacenLocal.observarEventosDeAnimal(animal.UUID_ANIMAL).subscribe({
          next: eventos => { this.palpacionesHembra = eventos.palpaciones; this.partosHembra = eventos.partos; this.cd.detectChanges(); },
        });
      } catch { }
    }
    this.cd.detectChanges();
  }

  elegirResultado(resultado: Resultado): void {
    this.resultado = resultado;
    if (resultado === 'VACIA') {
      this.meses = null;
    }
    delete this.errores.resultado;
    delete this.errores.meses;
    this.cd.detectChanges();
  }

  elegirMeses(meses: number): void {
    this.meses = meses;
    delete this.errores.meses;
    this.cd.detectChanges();
  }

  //PARTO APROXIMADO: FECHA DE LA PALPACION + (9 - MESES) MESES
  get partoAproximado(): string | null {
    const fecha = this.form.controls.fecha.value;
    if (this.resultado !== 'PRENIADA' || !this.meses || !fecha) {
      return null;
    }
    return fechaLegible(sumarMeses(fecha, 9 - this.meses));
  }

  private validar(): boolean {
    const v = this.form.getRawValue();
    const e: Partial<Record<CampoError, string>> = {};
    const h = this.hembra;
    if (!h) {
      e.animal = 'Elige la hembra';
    }
    const errorFecha = validarFechaEvento(h, v.fecha);
    if (errorFecha) {
      e.fecha = errorFecha;
    } else if (h && eraTernera(h, v.fecha, this.partosHembra)) {
      e.fecha = 'En esa fecha era una ternera: no se puede palpar';
    } else if (h && this.palpacionesHembra.some(p => p.FECHA_EVENTO.slice(0, 10) === v.fecha.slice(0, 10))) {
      e.fecha = `Ya hay una palpación de ${etiquetaAnimal(h)} ese mismo día`;
    }
    if (!this.resultado) {
      e.resultado = 'Elige el resultado: preñada o vacía';
    } else if (this.resultado === 'PRENIADA' && (!this.meses || this.meses < 1 || this.meses > 9)) {
      e.meses = 'Escribe de cuántos meses está preñada (de 1 a 9)';
    }
    if (v.nota.length > 300) {
      e.nota = 'La nota es demasiado larga (máximo 300 caracteres)';
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    if (this.guardando || !this.validar() || !this.hembra || !this.resultado) {
      this.cd.detectChanges();
      return;
    }
    const v = this.form.getRawValue();
    const preniada = this.resultado === 'PRENIADA';
    const datos: DatosPalpacion = {
      uuid_animal: this.hembra.UUID_ANIMAL,
      resultado_palpacion: this.resultado,
      meses_gestacion: preniada ? this.meses : null,
      fecha_evento: v.fecha,
      observacion: v.nota.trim() || null,
    };
    const partoAproximado = this.partoAproximado;
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.eventosService.registrarPalpacion(datos);
      const etiqueta = etiquetaAnimal(this.hembra);
      const texto = preniada ? `${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}: preñada de ${this.meses} ${this.meses === 1 ? 'mes' : 'meses'}` : `${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}: vacía`;
      this.guardado = { uuidAnimal: this.hembra.UUID_ANIMAL, texto, partoAproximado };
      this.toast.success(`Palpación guardada: ${preniada ? 'preñada' : 'vacía'}.`, 'Éxito', 5000, true, true, true);
    } catch (e: any) {
      this.toast.danger(e?.message || 'No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  registrarOtra(): void {
    this.guardado = null;
    this.hembra = null;
    this.resultado = null;
    this.meses = null;
    this.palpacionesHembra = [];
    this.partosHembra = [];
    this.subsHembra?.unsubscribe();
    this.subsHembra = null;
    this.uuidInicial = null;
    this.errores = {};
    this.form.reset({ fecha: ahoraLocal(), nota: '' });
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.cd.detectChanges();
  }

  verFicha(): void {
    if (this.guardado) {
      this.router.navigate(['/app/hato', this.guardado.uuidAnimal]);
    }
  }
}
