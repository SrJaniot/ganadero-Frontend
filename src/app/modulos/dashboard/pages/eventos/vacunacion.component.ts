import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { firstValueFrom, Subscription } from 'rxjs';
import { AnimalDTO, LoteDTO, VacunaDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { EventosService } from '../../../../servicios/eventos.service';
import { ahoraLocal, etiquetaAnimal } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { AnimalVista, aVista, compararPorChapeta, fechaLegible } from '../hato/hato-vista';

type Modo = 'UNO' | 'VARIOS';
type CampoError = 'vacuna' | 'animales' | 'fecha' | 'dosis' | 'nota';

//LOS TIPOS DEL CATALOGO EN EL ORDEN EN QUE SALEN (CK_TIPO_VACUNA)
const TIPOS: { tipo: string; titulo: string }[] = [
  { tipo: 'VACUNA', titulo: 'Vacunas' },
  { tipo: 'TRATAMIENTO', titulo: 'Tratamientos' },
  { tipo: 'DESPARASITANTE', titulo: 'Desparasitantes' },
  { tipo: 'VITAMINA', titulo: 'Vitaminas' },
];

//"2026-11-04" -> "04/11/2026" (COMO to_char(..., 'DD/MM/YYYY') EN LOS MENSAJES DE LA BASE)
function ddmmaaaa(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

//VACUNA, TRATAMIENTO O DESPARASITANTE A UNO O VARIOS ANIMALES, CON EL RETIRO DE LECHE A LA VISTA
//UN REGISTRO POR ANIMAL (registrarVacunacion). LAS REGLAS SON LAS DE FUN_VALIDAR_VACUNACIONES Y FUN_VALIDAR_EVENTO_ANIMAL
@Component({
  selector: 'app-vacunacion',
  standalone: false,
  templateUrl: './vacunacion.component.html',
})
export class VacunacionComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private eventosService = inject(EventosService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puedeRegistrar = this.seguridadService.tienePermiso(4, 'guardar');
  cargando = true;
  guardando = false;
  errores: Partial<Record<CampoError, string>> = {};

  vacunas: VacunaDTO[] = [];
  grupos: { titulo: string; productos: VacunaDTO[] }[] = [];
  idVacuna: number | null = null;

  modo: Modo = 'UNO';
  uuidInicial: string | null = null;
  animalUno: AnimalDTO | null = null;

  //VARIOS: LOTE COMPLETO O ESCOGIDOS CON CASILLAS
  lotes: (LoteDTO & { ANIMALES_ACTIVOS: number })[] = [];
  private hato: AnimalDTO[] = [];
  elegidos = new Set<string>();
  loteElegido = '';
  busqueda = '';

  //RESULTADO AL GUARDAR
  resultado: {
    producto: string; cantidad: number; proximaDosis: string | null; finRetiro: string | null; saltados: string[];
  } | null = null;

  form = new FormGroup({
    dosis: new FormControl('', { nonNullable: true }),
    fecha: new FormControl(ahoraLocal(), { nonNullable: true }),
    nota: new FormControl('', { nonNullable: true }),
  });

  private subscripciones: Subscription[] = [];

  ngOnInit(): void {
    this.uuidInicial = this.route.snapshot.queryParamMap.get('animal');
    if (!this.puedeRegistrar) {
      this.cargando = false;
      return;
    }
    try {
      this.almacenLocal.vacunas().then(lista => {
        this.vacunas = lista;
        this.grupos = TIPOS.map(t => ({ titulo: t.titulo, productos: lista.filter(v => v.TIPO_VACUNA === t.tipo) }))
          .filter(g => g.productos.length > 0);
        this.cargando = false;
        this.cd.detectChanges();
      }).catch(() => { this.cargando = false; this.cd.detectChanges(); });
      this.subscripciones.push(
        this.almacenLocal.observarAnimales(true).subscribe({
          next: lista => { this.hato = lista; this.cd.detectChanges(); },
        }),
        this.almacenLocal.observarLotes().subscribe({
          next: lista => { this.lotes = lista; this.cd.detectChanges(); },
        }),
      );
    } catch {
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  //---------------------------------------------EL PRODUCTO--------------------------------------------------------------

  elegirVacuna(id: number): void {
    this.idVacuna = id;
    delete this.errores.vacuna;
    this.cd.detectChanges();
  }

  get vacuna(): VacunaDTO | null {
    return this.vacunas.find(v => v.ID_VACUNA === this.idVacuna) ?? null;
  }

  textoRetiro(v: VacunaDTO): string {
    return v.DIAS_RETIRO_LECHE > 0 ? `No vender leche ${v.DIAS_RETIRO_LECHE} ${v.DIAS_RETIRO_LECHE === 1 ? 'día' : 'días'}` : 'Sin retiro de leche';
  }

  textoRefuerzo(v: VacunaDTO): string | null {
    if (!v.DIAS_REFUERZO) {
      return null;
    }
    if (v.DIAS_REFUERZO % 30 === 0 && v.DIAS_REFUERZO >= 60) {
      return `Repetir cada ${v.DIAS_REFUERZO / 30} meses`;
    }
    return `Repetir a los ${v.DIAS_REFUERZO} días`;
  }

  //---------------------------------------------A QUIEN------------------------------------------------------------------

  elegirModo(modo: Modo): void {
    this.modo = modo;
    delete this.errores.animales;
    this.cd.detectChanges();
  }

  alElegirUno(animal: AnimalDTO | null): void {
    this.animalUno = animal;
    delete this.errores.animales;
    this.cd.detectChanges();
  }

  //LA LISTA PARA ESCOGER: LOS ACTIVOS EN ORDEN DE CHAPETA, CON EL BUSCADOR
  get listaVarios(): AnimalVista[] {
    const texto = this.busqueda.trim().toLowerCase();
    return this.hato.map(aVista)
      .filter(a => !texto || a.textoBusqueda.includes(texto))
      .sort(compararPorChapeta);
  }

  //TOCAR UN LOTE ELIGE TODOS SUS ANIMALES (TOCARLO OTRA VEZ LOS QUITA)
  elegirLote(uuid: string): void {
    const delLote = this.hato.filter(a => uuid === 'SIN' ? !a.UUID_LOTE : a.UUID_LOTE === uuid).map(a => a.UUID_ANIMAL);
    if (this.loteElegido === uuid) {
      this.loteElegido = '';
      delLote.forEach(u => this.elegidos.delete(u));
    } else {
      this.loteElegido = uuid;
      this.elegidos = new Set(delLote);
    }
    delete this.errores.animales;
    this.cd.detectChanges();
  }

  get haySinLote(): boolean {
    return this.hato.some(a => !a.UUID_LOTE);
  }

  cuantosSinLote(): number {
    return this.hato.filter(a => !a.UUID_LOTE).length;
  }

  alternar(uuid: string): void {
    if (this.elegidos.has(uuid)) {
      this.elegidos.delete(uuid);
    } else {
      this.elegidos.add(uuid);
    }
    this.loteElegido = '';
    delete this.errores.animales;
    this.cd.detectChanges();
  }

  todos(): void {
    this.listaVarios.forEach(a => this.elegidos.add(a.uuid));
    this.loteElegido = '';
    delete this.errores.animales;
    this.cd.detectChanges();
  }

  ninguno(): void {
    this.elegidos.clear();
    this.loteElegido = '';
    this.cd.detectChanges();
  }

  //LOS ANIMALES A LOS QUE SE LES VA A REGISTRAR
  private get destino(): AnimalDTO[] {
    if (this.modo === 'UNO') {
      return this.animalUno ? [this.animalUno] : [];
    }
    return this.hato.filter(a => this.elegidos.has(a.UUID_ANIMAL));
  }

  get cuantos(): number {
    return this.destino.length;
  }

  //---------------------------------------------GUARDAR------------------------------------------------------------------

  get ahora(): string {
    return ahoraLocal();
  }

  private validar(): boolean {
    const v = this.form.getRawValue();
    const e: Partial<Record<CampoError, string>> = {};
    if (!this.vacuna) {
      e.vacuna = 'Elige la vacuna o el producto de la lista';
    }
    if (this.destino.length === 0) {
      e.animales = this.modo === 'UNO' ? 'Elige el animal' : 'Elige un lote o toca los animales';
    }
    if (!v.fecha) {
      e.fecha = 'Falta la fecha';
    } else if (v.fecha > ahoraLocal()) {
      e.fecha = 'La fecha no puede ser futura';
    } else if (this.modo === 'UNO' && this.animalUno && v.fecha.slice(0, 10) < this.animalUno.FECHA_NACIMIENTO.slice(0, 10)) {
      e.fecha = `La fecha es anterior al nacimiento de ${etiquetaAnimal(this.animalUno)} (${ddmmaaaa(this.animalUno.FECHA_NACIMIENTO)})`;
    }
    if (v.dosis.trim().length > 40) {
      e.dosis = 'La dosis es demasiado larga (máximo 40 caracteres)';
    }
    if (v.nota.length > 300) {
      e.nota = 'La nota es demasiado larga (máximo 300 caracteres)';
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    if (this.guardando || !this.validar() || !this.vacuna) {
      this.cd.detectChanges();
      return;
    }
    const v = this.form.getRawValue();
    const vacuna = this.vacuna;
    const dia = v.fecha.slice(0, 10);
    this.guardando = true;
    this.cd.detectChanges();
    const saltados: string[] = [];
    let guardados = 0;
    let proximaDosis: string | null = null;
    let finRetiro: string | null = null;
    try {
      for (const animal of this.destino) {
        //LAS MISMAS REGLAS DE LA BASE: NO ANTES DEL NACIMIENTO Y NO EL MISMO PRODUCTO EL MISMO DIA
        if (dia < animal.FECHA_NACIMIENTO.slice(0, 10)) {
          saltados.push(`${etiquetaAnimal(animal)}: nació después de esa fecha`);
          continue;
        }
        const eventos = await firstValueFrom(this.almacenLocal.observarEventosDeAnimal(animal.UUID_ANIMAL));
        if (eventos.vacunaciones.some(x => x.ID_VACUNA === vacuna.ID_VACUNA && x.FECHA_EVENTO.slice(0, 10) === dia)) {
          saltados.push(`Ese producto ya se le registró a ${etiquetaAnimal(animal)} ese mismo día`);
          continue;
        }
        const r = await this.eventosService.registrarVacunacion({
          uuid_animal: animal.UUID_ANIMAL, id_vacuna: vacuna.ID_VACUNA, dosis_vacunacion: v.dosis.trim() || null,
          fecha_evento: v.fecha, observacion: v.nota.trim() || null,
        });
        proximaDosis = r.proximaDosis;
        finRetiro = r.finRetiro;
        guardados++;
      }
      if (guardados === 0) {
        this.toast.warning(saltados.length === 1 ? saltados[0] : 'No se guardó nada: ninguno de los elegidos se podía registrar (mira por qué).', 'Atención', 5000, true, true, true);
        this.errores.animales = saltados.join('. ');
        return;
      }
      this.resultado = { producto: vacuna.NOM_VACUNA, cantidad: guardados, proximaDosis, finRetiro, saltados };
      this.toast.success(`${vacuna.NOM_VACUNA}: ${guardados} ${guardados === 1 ? 'animal' : 'animales'}. Guardado en el celular.`, 'Éxito', 5000, true, true, true);
      if (saltados.length) {
        this.toast.warning(`Se saltaron ${saltados.length}: mira cuáles en el resumen.`, 'Atención', 5000, true, true, true);
      }
    } catch {
      this.toast.danger(guardados > 0
        ? `Se guardaron ${guardados}, pero los demás no. Revisa e inténtalo otra vez.`
        : 'No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  fecha(f: string | null): string {
    return fechaLegible(f);
  }

  //OTRO REGISTRO: SE CONSERVA EL PRODUCTO (SUELE SER LA MISMA JORNADA DE VACUNACION) Y SE LIMPIAN LOS ANIMALES
  registrarOtro(): void {
    this.resultado = null;
    this.animalUno = null;
    this.uuidInicial = null;
    this.elegidos = new Set();
    this.loteElegido = '';
    this.busqueda = '';
    this.errores = {};
    this.form.reset({ dosis: this.form.controls.dosis.value, fecha: ahoraLocal(), nota: '' });
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.cd.detectChanges();
  }

  volver(): void {
    this.router.navigate(['/app/hoy']);
  }
}
