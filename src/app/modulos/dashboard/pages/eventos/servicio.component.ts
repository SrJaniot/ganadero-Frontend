import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { AnimalDTO, ServicioDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { DatosServicio, DIAS_GESTACION, EventosService, sumarDias } from '../../../../servicios/eventos.service';
import { ahoraLocal, etiquetaAnimal, mesesCumplidos } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { fechaLegible } from '../hato/hato-vista';
import { etiquetaMayuscula, mesesEnFecha, validarFechaEvento } from './reglas-eventos';

type TipoServicio = 'MONTA' | 'INSEMINACION';
type ToroMonta = 'FINCA' | 'AFUERA' | 'NO_SE';
type CampoError = 'animal' | 'tipo' | 'toro' | 'pajilla' | 'fecha' | 'nota';

//MESES MINIMOS PARA UN SERVICIO (TAB_CONFIGURACION: MESES_MINIMOS_SERVICIO, VALOR DE FABRICA)
const MESES_MINIMOS_SERVICIO = 12;

//MONTA (TORO DE LA FINCA O DE AFUERA, O "NO SE") O INSEMINACION (PAJILLA), CON EL PARTO PROBABLE
//LAS REGLAS SON LAS DE FUN_VALIDAR_SERVICIOS Y FUN_VALIDAR_EVENTO_ANIMAL. SE GUARDA EN EL CELULAR Y VA A LA BANDEJA
@Component({
  selector: 'app-servicio',
  standalone: false,
  templateUrl: './servicio.component.html',
})
export class ServicioComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private eventosService = inject(EventosService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puedeRegistrar = this.seguridadService.tienePermiso(4, 'guardar');
  readonly diasGestacion = DIAS_GESTACION;
  guardando = false;
  uuidInicial: string | null = null;
  errores: Partial<Record<CampoError, string>> = {};

  hembra: AnimalDTO | null = null;
  toro: AnimalDTO | null = null;
  tipo: TipoServicio | null = null;
  toroMonta: ToroMonta | null = null;
  private serviciosHembra: ServicioDTO[] = [];
  private subsHembra: Subscription | null = null;

  //LO QUE SE GUARDO: PARA MOSTRAR EL PARTO PROBABLE EN GRANDE
  guardado: { uuidAnimal: string; texto: string; partoProbable: string } | null = null;

  form = new FormGroup({
    toroExterno: new FormControl('', { nonNullable: true }),
    pajilla: new FormControl('', { nonNullable: true }),
    fecha: new FormControl(ahoraLocal(), { nonNullable: true }),
    nota: new FormControl('', { nonNullable: true }),
  });

  //EN LA LISTA SALE LA HEMBRA PERO NO SE PUEDE TOCAR SI ES MUY JOVEN
  readonly motivoHembra = (animal: AnimalDTO): string | null =>
    mesesCumplidos(animal.FECHA_NACIMIENTO) < MESES_MINIMOS_SERVICIO ? `Tiene menos de ${MESES_MINIMOS_SERVICIO} meses` : null;

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
    this.serviciosHembra = [];
    delete this.errores.animal;
    this.subsHembra?.unsubscribe();
    this.subsHembra = null;
    if (animal) {
      try {
        this.subsHembra = this.almacenLocal.observarEventosDeAnimal(animal.UUID_ANIMAL).subscribe({
          next: eventos => { this.serviciosHembra = eventos.servicios; this.cd.detectChanges(); },
        });
      } catch { }
    }
    this.cd.detectChanges();
  }

  alElegirToro(animal: AnimalDTO | null): void {
    this.toro = animal;
    delete this.errores.toro;
    this.cd.detectChanges();
  }

  elegirTipo(tipo: TipoServicio): void {
    this.tipo = tipo;
    delete this.errores.tipo;
    delete this.errores.toro;
    delete this.errores.pajilla;
    this.cd.detectChanges();
  }

  elegirToroMonta(opcion: ToroMonta): void {
    this.toroMonta = opcion;
    delete this.errores.toro;
    this.cd.detectChanges();
  }

  //PARTO PROBABLE EN VIVO (DIAS_GESTACION DESPUES DE LA FECHA)
  get partoProbable(): string | null {
    const fecha = this.form.controls.fecha.value;
    if (!fecha) {
      return null;
    }
    return fechaLegible(sumarDias(fecha, DIAS_GESTACION));
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
    } else if (h && mesesEnFecha(h, v.fecha) < MESES_MINIMOS_SERVICIO) {
      e.animal = `${etiquetaMayuscula(h)} tenía menos de ${MESES_MINIMOS_SERVICIO} meses en esa fecha`;
    } else if (h && this.serviciosHembra.some(s => s.FECHA_EVENTO.slice(0, 10) === v.fecha.slice(0, 10))) {
      e.fecha = `Ya hay un servicio de ${etiquetaAnimal(h)} ese mismo día`;
    }
    if (!this.tipo) {
      e.tipo = 'Elige si fue monta o inseminación';
    } else if (this.tipo === 'INSEMINACION') {
      const pajilla = v.pajilla.trim();
      if (!pajilla) {
        e.pajilla = 'Escribe la pajilla o el toro de la inseminación';
      } else if (pajilla.length > 80) {
        e.pajilla = 'El toro de afuera es demasiado largo (máximo 80 caracteres)';
      }
    } else {
      if (!this.toroMonta) {
        e.toro = '¿Con qué toro? Elige uno de la finca, uno de afuera o «No sé»';
      } else if (this.toroMonta === 'FINCA' && !this.toro) {
        e.toro = 'Elige el toro de la finca';
      } else if (this.toroMonta === 'AFUERA') {
        const afuera = v.toroExterno.trim();
        if (!afuera) {
          e.toro = 'Escribe cuál es el toro de afuera';
        } else if (afuera.length > 80) {
          e.toro = 'El toro de afuera es demasiado largo (máximo 80 caracteres)';
        }
      }
    }
    if (v.nota.length > 300) {
      e.nota = 'La nota es demasiado larga (máximo 300 caracteres)';
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    if (this.guardando || !this.validar() || !this.hembra || !this.tipo) {
      this.cd.detectChanges();
      return;
    }
    const v = this.form.getRawValue();
    const monta = this.tipo === 'MONTA';
    const datos: DatosServicio = {
      uuid_animal: this.hembra.UUID_ANIMAL,
      tipo_servicio: this.tipo,
      uuid_toro: monta && this.toroMonta === 'FINCA' ? this.toro?.UUID_ANIMAL ?? null : null,
      toro_externo: monta ? (this.toroMonta === 'AFUERA' ? v.toroExterno.trim() : null) : v.pajilla.trim(),
      fecha_evento: v.fecha,
      observacion: v.nota.trim() || null,
    };
    this.guardando = true;
    this.cd.detectChanges();
    try {
      const resultado = await this.eventosService.registrarServicio(datos);
      const texto = `${monta ? 'Monta' : 'Inseminación'} de ${etiquetaAnimal(this.hembra)}`;
      this.guardado = { uuidAnimal: this.hembra.UUID_ANIMAL, texto, partoProbable: fechaLegible(resultado.partoProbable) };
      this.toast.success(`${texto} guardada. Parto probable: ${fechaLegible(resultado.partoProbable)}.`, 'Éxito', 5000, true, true, true);
    } catch (e: any) {
      this.toast.danger(e?.message || 'No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  registrarOtro(): void {
    this.guardado = null;
    this.hembra = null;
    this.toro = null;
    this.tipo = null;
    this.toroMonta = null;
    this.serviciosHembra = [];
    this.subsHembra?.unsubscribe();
    this.subsHembra = null;
    this.uuidInicial = null;
    this.errores = {};
    this.form.reset({ toroExterno: '', pajilla: '', fecha: ahoraLocal(), nota: '' });
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.cd.detectChanges();
  }

  verFicha(): void {
    if (this.guardado) {
      this.router.navigate(['/app/hato', this.guardado.uuidAnimal]);
    }
  }
}
