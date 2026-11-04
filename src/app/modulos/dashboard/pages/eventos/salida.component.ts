import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { AnimalDTO, EventosAnimal } from '../../../../Modelos/GanaderoModel';
import { formatearPesos } from '../../../../compartido/pesos.pipe';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { DatosSalida, EventosService } from '../../../../servicios/eventos.service';
import { ahoraLocal, etiquetaAnimal } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { fechaLegible } from '../hato/hato-vista';

type TipoSalida = 'VENTA' | 'MUERTE' | 'TRASLADO';
type CampoError = 'animal' | 'tipo' | 'valor' | 'peso' | 'causa' | 'fecha' | 'nota';

//"2026-11-04T07:40" -> "04/11/2026" (COMO to_char(..., 'DD/MM/YYYY') EN LOS MENSAJES DE LA BASE)
function ddmmaaaa(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

//FECHA_EVENTO EN EL FORMATO DEL CELULAR (AAAA-MM-DDTHH:mm) PARA COMPARAR: LA DEL SERVIDOR PUEDE TRAER SEGUNDOS O UN ESPACIO
function aMinutos(fecha: string): string {
  return fecha.replace(' ', 'T').slice(0, 16);
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

//SALIDA DEL HATO: VENTA (CON EL VALOR), MUERTE (CON LA CAUSA) O TRASLADO. EL ANIMAL NO SE BORRA: QUEDA COMO VENDIDO, MUERTO O TRASLADADO
//LAS REGLAS SON LAS DE FUN_VALIDAR_SALIDAS Y FUN_VALIDAR_EVENTO_ANIMAL (MISMOS MENSAJES)
@Component({
  selector: 'app-salida',
  standalone: false,
  templateUrl: './salida.component.html',
})
export class SalidaComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private eventosService = inject(EventosService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puedeRegistrar = this.seguridadService.tienePermiso(4, 'guardar');
  guardando = false;
  confirmando = false;
  errores: Partial<Record<CampoError, string>> = {};

  uuidInicial: string | null = null;
  animal: AnimalDTO | null = null;
  private eventos: EventosAnimal | null = null;
  tipo: TipoSalida | null = null;
  //EL VALOR SE ESCRIBE CON PUNTOS DE MILES MIENTRAS SE TECLEA ("1.250.000"); SOLO SE GUARDAN LOS DIGITOS
  valorTexto = '';

  readonly causasRapidas = ['Enfermedad', 'Accidente', 'Parto', 'Desconocida'];

  form = new FormGroup({
    peso: new FormControl('', { nonNullable: true }),
    causa: new FormControl('', { nonNullable: true }),
    fecha: new FormControl(ahoraLocal(), { nonNullable: true }),
    nota: new FormControl('', { nonNullable: true }),
  });

  private subEventos: Subscription | null = null;

  ngOnInit(): void {
    this.uuidInicial = this.route.snapshot.queryParamMap.get('animal');
  }

  ngOnDestroy(): void {
    this.subEventos?.unsubscribe();
  }

  //---------------------------------------------EL ANIMAL----------------------------------------------------------------

  alElegir(animal: AnimalDTO | null): void {
    this.animal = animal;
    this.eventos = null;
    delete this.errores.animal;
    delete this.errores.fecha;
    this.subEventos?.unsubscribe();
    this.subEventos = null;
    if (animal) {
      //SUS REGISTROS (PARA QUE LA SALIDA NO QUEDE ANTES DEL ULTIMO) Y SI YA TIENE UNA SALIDA
      this.subEventos = this.almacenLocal.observarEventosDeAnimal(animal.UUID_ANIMAL).subscribe({
        next: ev => { this.eventos = ev; this.cd.detectChanges(); },
      });
    }
    this.cd.detectChanges();
  }

  //LA FECHA DEL REGISTRO MAS RECIENTE (PESAJES, VACUNAS, SERVICIOS, PALPACIONES, PARTOS Y ORDEÑOS), COMO jULTIMO_EVENTO EN LA BASE
  get ultimoRegistro(): string | null {
    if (!this.eventos) {
      return null;
    }
    const e = this.eventos;
    const fechas = [...e.pesajes, ...e.vacunaciones, ...e.servicios, ...e.palpaciones, ...e.partos, ...e.ordenos]
      .map(x => aMinutos(x.FECHA_EVENTO)).sort();
    return fechas.length ? fechas[fechas.length - 1] : null;
  }

  get ultimoRegistroLegible(): string {
    return this.ultimoRegistro ? fechaLegible(this.ultimoRegistro, true) : '';
  }

  //YA TIENE UNA SALIDA ACTIVA EN EL CELULAR (POR EJEMPLO, REGISTRADA EN OTRO MOMENTO SIN SEÑAL)
  get yaTieneSalida(): string | null {
    if (!this.animal) {
      return null;
    }
    if ((this.eventos?.salidas.length ?? 0) > 0 || this.animal.ESTADO_ANIMAL !== 'ACTIVO') {
      return `${mayuscula(etiquetaAnimal(this.animal))} ya tiene registrada su salida. Si está mal, anúlala primero`;
    }
    return null;
  }

  //---------------------------------------------TIPO Y DATOS---------------------------------------------------------------

  elegirTipo(tipo: TipoSalida): void {
    this.tipo = tipo;
    this.errores = { ...(this.errores.animal ? { animal: this.errores.animal } : {}) };
    this.cd.detectChanges();
  }

  alEscribirValor(texto: string): void {
    const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
    this.valorTexto = digitos ? Number(digitos).toLocaleString('es-CO') : '';
    delete this.errores.valor;
    this.cd.detectChanges();
  }

  get valor(): number | null {
    const digitos = this.valorTexto.replace(/\D/g, '');
    return digitos ? Number(digitos) : null;
  }

  ponerCausa(causa: string): void {
    this.form.controls.causa.setValue(causa);
    delete this.errores.causa;
    this.cd.detectChanges();
  }

  get ahora(): string {
    return ahoraLocal();
  }

  private numero(texto: string): number | null {
    const limpio = texto.trim().replace(',', '.');
    if (!limpio) {
      return null;
    }
    const n = Number(limpio);
    return isNaN(n) ? null : n;
  }

  //---------------------------------------------VALIDAR, CONFIRMAR Y GUARDAR------------------------------------------------

  private validar(): boolean {
    const v = this.form.getRawValue();
    const e: Partial<Record<CampoError, string>> = {};
    const a = this.animal;
    if (!a) {
      e.animal = 'Elige el animal';
    } else if (this.yaTieneSalida) {
      e.animal = this.yaTieneSalida;
    }
    if (!v.fecha) {
      e.fecha = 'Falta la fecha';
    } else if (v.fecha > ahoraLocal()) {
      e.fecha = 'La fecha no puede ser futura';
    } else if (a && v.fecha.slice(0, 10) < a.FECHA_NACIMIENTO.slice(0, 10)) {
      e.fecha = `La fecha es anterior al nacimiento de ${etiquetaAnimal(a)} (${ddmmaaaa(a.FECHA_NACIMIENTO)})`;
    } else if (this.ultimoRegistro && aMinutos(v.fecha) < this.ultimoRegistro) {
      e.fecha = `Tiene registros hasta el ${ddmmaaaa(this.ultimoRegistro)}: la salida no puede ser antes`;
    }
    if (!this.tipo) {
      e.tipo = 'Elige el tipo de salida: venta, muerte o traslado';
    } else if (this.tipo === 'VENTA') {
      const valor = this.valor;
      if (valor === null || valor <= 0) {
        e.valor = 'Escribe en cuánto se vendió';
      } else if (valor > 99999999999) {
        e.valor = 'Revisa el valor de la venta';
      }
      const peso = this.numero(v.peso);
      if (v.peso.trim() && (peso === null || peso <= 0 || peso > 1500)) {
        e.peso = 'El peso de salida debe estar entre 1 y 1500 kilos';
      }
    } else if (this.tipo === 'MUERTE') {
      if (!v.causa.trim()) {
        e.causa = 'Escribe la causa de la muerte (si no se sabe, "desconocida")';
      } else if (v.causa.trim().length > 200) {
        e.causa = 'La causa es demasiado larga (máximo 200 caracteres)';
      }
    }
    if (v.nota.length > 300) {
      e.nota = 'La nota es demasiado larga (máximo 300 caracteres)';
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  //PRIMERO SE REVISA; SI TODO ESTA BIEN, SE PIDE CONFIRMAR
  pedirConfirmacion(): void {
    if (this.guardando || !this.validar()) {
      this.cd.detectChanges();
      return;
    }
    this.confirmando = true;
    this.cd.detectChanges();
  }

  get textoConfirmar(): string {
    if (!this.animal || !this.tipo) {
      return '';
    }
    const quien = mayuscula(etiquetaAnimal(this.animal));
    if (this.tipo === 'VENTA') {
      return `${quien} se vendió en ${formatearPesos(this.valor)} y sale del hato.`;
    }
    if (this.tipo === 'MUERTE') {
      return `${quien} murió (${this.form.controls.causa.value.trim()}) y sale del hato.`;
    }
    return `${quien} se trasladó y sale del hato.`;
  }

  async guardar(): Promise<void> {
    if (this.guardando || !this.validar() || !this.animal || !this.tipo) {
      this.confirmando = false;
      this.cd.detectChanges();
      return;
    }
    const v = this.form.getRawValue();
    const datos: DatosSalida = {
      uuid_animal: this.animal.UUID_ANIMAL,
      tipo_salida: this.tipo,
      valor_salida: this.tipo === 'VENTA' ? this.valor : null,
      peso_salida_kg: this.tipo === 'VENTA' ? this.numero(v.peso) : null,
      causa_salida: this.tipo === 'MUERTE' ? v.causa.trim() : null,
      fecha_evento: v.fecha,
      observacion: v.nota.trim() || null,
    };
    const quien = mayuscula(etiquetaAnimal(this.animal));
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.eventosService.registrarSalida(datos);
      const que = this.tipo === 'VENTA' ? `se vendió en ${formatearPesos(datos.valor_salida)}` : this.tipo === 'MUERTE' ? 'murió' : 'se trasladó';
      this.toast.success(`${quien} ${que}. Guardado en el celular.`, 'Éxito', 5000, true, true, true);
      this.confirmando = false;
      this.router.navigate(['/app/hoy']);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  cancelarConfirmacion(): void {
    this.confirmando = false;
    this.cd.detectChanges();
  }
}
