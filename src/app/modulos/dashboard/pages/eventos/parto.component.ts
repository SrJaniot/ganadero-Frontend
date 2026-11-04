import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { AnimalDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { DatosParto, DIAS_MINIMOS_ENTRE_PARTOS, EventosService } from '../../../../servicios/eventos.service';
import { ahoraLocal, categoriaAnimal } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { eraTernera, etiquetaMayuscula, fechaCorta, validarFechaEvento } from './reglas-eventos';

type TipoParto = 'NORMAL' | 'ASISTIDO' | 'CESAREA' | 'ABORTO';
type CampoError = 'animal' | 'tipo' | 'viva' | 'sexo' | 'chapeta' | 'nombre' | 'peso' | 'fecha' | 'nota';

const REGEX_CHAPETA = /^[A-Za-z0-9-]{1,20}$/;

//PARIO: LA MADRE (NO TERNERA), COMO FUE, Y SI LA CRIA NACIO VIVA ENTRA SOLA AL HATO CON LA MADRE, EL PADRE DEL ULTIMO SERVICIO
//Y EL LOTE DE LA MADRE. LAS REGLAS SON LAS DE FUN_VALIDAR_PARTOS Y FUN_VALIDAR_EVENTO_ANIMAL (TAMBIEN LOS 240 DIAS ENTRE PARTOS)
@Component({
  selector: 'app-parto',
  standalone: false,
  templateUrl: './parto.component.html',
})
export class PartoComponent implements OnInit, OnDestroy {
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

  madre: AnimalDTO | null = null;
  tipo: TipoParto | null = null;
  criaViva: 'SI' | 'NO' | null = null;
  sexoCria: 'H' | 'M' | null = null;
  //DE QUIEN SERIA EL PADRE (ULTIMO SERVICIO DESPUES DEL PARTO ANTERIOR)
  textoPadre: string | null = null;
  private consultaPadre = 0;

  readonly tipos: { valor: TipoParto; texto: string }[] = [
    { valor: 'NORMAL', texto: 'Normal' },
    { valor: 'ASISTIDO', texto: 'Asistido' },
    { valor: 'CESAREA', texto: 'Cesárea' },
    { valor: 'ABORTO', texto: 'Aborto' },
  ];

  guardado: { uuidMadre: string; uuidCria: string | null; texto: string } | null = null;

  form = new FormGroup({
    chapeta: new FormControl('', { nonNullable: true }),
    nombre: new FormControl('', { nonNullable: true }),
    peso: new FormControl('', { nonNullable: true }),
    fecha: new FormControl(ahoraLocal(), { nonNullable: true }),
    nota: new FormControl('', { nonNullable: true }),
  });

  private subscripciones: Subscription[] = [];

  readonly motivoMadre = (animal: AnimalDTO): string | null =>
    categoriaAnimal(animal) === 'TERNERA' ? 'Es una ternera: todavía no puede parir' : null;

  ngOnInit(): void {
    this.uuidInicial = this.route.snapshot.queryParamMap.get('animal');
    this.subscripciones.push(this.form.controls.fecha.valueChanges.subscribe(() => this.buscarPadre()));
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  get ahora(): string {
    return ahoraLocal();
  }

  get hayCria(): boolean {
    return this.tipo !== null && this.tipo !== 'ABORTO' && this.criaViva === 'SI';
  }

  get palabraCria(): string {
    return this.sexoCria === 'M' ? 'ternero' : this.sexoCria === 'H' ? 'ternera' : 'cría';
  }

  get loteMadre(): string | null {
    return this.madre?.UUID_LOTE ? (this.madre.NOM_LOTE ?? null) : null;
  }

  alElegirMadre(animal: AnimalDTO | null): void {
    this.madre = animal;
    delete this.errores.animal;
    this.buscarPadre();
    this.cd.detectChanges();
  }

  elegirTipo(tipo: TipoParto): void {
    this.tipo = tipo;
    if (tipo === 'ABORTO') {
      this.criaViva = null;
      this.sexoCria = null;
    }
    delete this.errores.tipo;
    delete this.errores.viva;
    this.cd.detectChanges();
  }

  elegirViva(viva: 'SI' | 'NO'): void {
    this.criaViva = viva;
    delete this.errores.viva;
    this.cd.detectChanges();
  }

  elegirSexo(sexo: 'H' | 'M'): void {
    this.sexoCria = sexo;
    delete this.errores.sexo;
    this.cd.detectChanges();
  }

  //EL PADRE DE LA CRIA SALE DEL ULTIMO SERVICIO DE LA MADRE ANTES DEL PARTO (Y DESPUES DEL PARTO ANTERIOR), COMO EN LA BASE
  private async buscarPadre(): Promise<void> {
    const consulta = ++this.consultaPadre;
    const madre = this.madre;
    const fecha = this.form.controls.fecha.value;
    if (!madre || !fecha) {
      this.textoPadre = null;
      this.cd.detectChanges();
      return;
    }
    try {
      const servicio = await this.almacenLocal.ultimoServicioAntes(madre.UUID_ANIMAL, fecha);
      let texto: string | null = null;
      if (servicio?.UUID_TORO) {
        const toro = await this.almacenLocal.animalPorUuid(servicio.UUID_TORO);
        const nombre = toro ? [toro.CHAPETA_ANIMAL, toro.NOM_ANIMAL].filter(Boolean).join(' · ') || 'sin chapeta' : 'de la finca';
        texto = `el toro ${nombre} (monta)`;
      } else if (servicio?.TORO_EXTERNO) {
        texto = servicio.TIPO_SERVICIO === 'INSEMINACION' ? `la pajilla ${servicio.TORO_EXTERNO}` : `${servicio.TORO_EXTERNO} (toro de afuera)`;
      }
      if (consulta === this.consultaPadre) {
        this.textoPadre = texto;
        this.cd.detectChanges();
      }
    } catch { }
  }

  private numero(texto: string): number | null {
    const limpio = texto.trim().replace(',', '.');
    if (!limpio) {
      return null;
    }
    const n = Number(limpio);
    return isNaN(n) ? NaN : n;
  }

  private async validar(): Promise<boolean> {
    const v = this.form.getRawValue();
    const e: Partial<Record<CampoError, string>> = {};
    const m = this.madre;
    if (!m) {
      e.animal = 'Elige la madre';
    }
    const errorFecha = validarFechaEvento(m, v.fecha);
    if (errorFecha) {
      e.fecha = errorFecha;
    } else if (m) {
      const partos = await this.almacenLocal.partosDe(m.UUID_ANIMAL);
      const dia = Date.parse(v.fecha.slice(0, 10));
      const cercano = partos.find(p => Math.abs(Math.round((Date.parse(p.FECHA_EVENTO.slice(0, 10)) - dia) / 86400000)) < DIAS_MINIMOS_ENTRE_PARTOS);
      if (eraTernera(m, v.fecha, partos)) {
        e.fecha = 'En esa fecha era una ternera: no pudo parir';
      } else if (cercano) {
        e.fecha = `${etiquetaMayuscula(m)} ya tiene un parto el ${fechaCorta(cercano.FECHA_EVENTO)}: dos partos deben estar separados al menos ${DIAS_MINIMOS_ENTRE_PARTOS} días`;
      }
    }
    if (!this.tipo) {
      e.tipo = 'Elige cómo fue: normal, asistido, cesárea o aborto';
    } else if (this.tipo !== 'ABORTO' && !this.criaViva) {
      e.viva = 'Indica si la cría nació viva';
    }
    if (this.hayCria) {
      if (!this.sexoCria) {
        e.sexo = 'Elige si la cría es ternera o ternero';
      }
      const chapeta = v.chapeta.trim();
      if (chapeta) {
        if (!REGEX_CHAPETA.test(chapeta)) {
          e.chapeta = 'La chapeta solo puede tener letras, números y guiones (máximo 20)';
        } else if (await this.almacenLocal.animalPorChapeta(chapeta)) {
          e.chapeta = `La chapeta ${chapeta.toUpperCase()} ya la tiene otro animal de la finca`;
        }
      }
      if (v.nombre.trim().length > 60) {
        e.nombre = 'El nombre de la cría es demasiado largo (máximo 60 caracteres)';
      }
      const peso = this.numero(v.peso);
      if (peso !== null && (isNaN(peso) || peso < 5 || peso > 80)) {
        e.peso = 'El peso al nacer debe estar entre 5 y 80 kilos';
      }
    }
    if (v.nota.length > 300) {
      e.nota = 'La nota es demasiado larga (máximo 300 caracteres)';
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    if (this.guardando) {
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    let valido = false;
    try {
      valido = await this.validar();
    } catch {
      valido = false;
    }
    if (!valido || !this.madre || !this.tipo) {
      this.guardando = false;
      this.cd.detectChanges();
      return;
    }
    const v = this.form.getRawValue();
    const cria = this.hayCria;
    const datos: DatosParto = {
      uuid_animal: this.madre.UUID_ANIMAL,
      tipo_parto: this.tipo,
      cria_viva: this.tipo === 'ABORTO' ? 'NO' : (this.criaViva ?? 'NO'),
      sexo_cria: cria ? this.sexoCria : null,
      chapeta_cria: cria ? (v.chapeta.trim() || null) : null,
      nom_cria: cria ? (v.nombre.trim() || null) : null,
      peso_cria_kg: cria ? this.numero(v.peso) : null,
      fecha_evento: v.fecha,
      observacion: v.nota.trim() || null,
    };
    try {
      const resultado = await this.eventosService.registrarParto(datos);
      const palabra = this.palabraCria;
      const texto = resultado.uuidCria
        ? `${palabra === 'ternero' ? 'El ternero' : 'La ternera'} ya está en el hato`
        : this.tipo === 'ABORTO' ? 'Aborto guardado' : 'Parto guardado (la cría nació muerta)';
      this.guardado = { uuidMadre: this.madre.UUID_ANIMAL, uuidCria: resultado.uuidCria, texto };
      this.toast.success(texto, 'Éxito', 5000, true, true, true);
    } catch (e: any) {
      this.toast.danger(e?.message || 'No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  registrarOtro(): void {
    this.guardado = null;
    this.madre = null;
    this.tipo = null;
    this.criaViva = null;
    this.sexoCria = null;
    this.textoPadre = null;
    this.uuidInicial = null;
    this.errores = {};
    this.form.reset({ chapeta: '', nombre: '', peso: '', fecha: ahoraLocal(), nota: '' });
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.cd.detectChanges();
  }

  ver(uuid: string | null): void {
    if (uuid) {
      this.router.navigate(['/app/hato', uuid]);
    }
  }
}
