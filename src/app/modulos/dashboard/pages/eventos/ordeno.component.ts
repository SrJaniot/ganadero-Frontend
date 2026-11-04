import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { AnimalDTO, LoteDTO, OrdenoDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { EventosService } from '../../../../servicios/eventos.service';
import { categoriaAnimal, etiquetaAnimal, hoyLocal, mesesCumplidos } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { AnimalVista, aVista, compararPorChapeta, fechaLegible } from '../hato/hato-vista';

type Jornada = 'MANANA' | 'TARDE';

//UNA VACA EN LA LISTA DEL ORDEÑO
interface VacaOrdeno {
  animal: AnimalDTO;
  vista: AnimalVista;
  litrosJornada: number | null;   //SI YA SE ORDEÑO EN ESTA JORNADA Y DIA: SUS LITROS (SALE MARCADA Y SIN CAMPO)
}

//HORA DEL EVENTO SEGUN LA JORNADA (EL ORDEÑO NO LLEVA HORA EXACTA: MAÑANA = 05:00, TARDE = 15:00)
const HORA_JORNADA: Record<Jornada, string> = { MANANA: '05:00', TARDE: '15:00' };

//"2026-11-04" -> "04/11/2026" (COMO to_char(..., 'DD/MM/YYYY') EN LOS MENSAJES DE LA BASE)
function ddmmaaaa(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

//ORDEÑO EN LOTE: SE ELIGE EL DIA Y LA JORNADA Y SE PASAN LAS VACAS UNA POR UNA ESCRIBIENDO SOLO LOS LITROS
//LAS REGLAS SON LAS DE FUN_VALIDAR_ORDENOS Y FUN_VALIDAR_EVENTO_ANIMAL (MISMOS MENSAJES)
@Component({
  selector: 'app-ordeno',
  standalone: false,
  templateUrl: './ordeno.component.html',
})
export class OrdenoComponent implements OnInit, OnDestroy {
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

  dia = hoyLocal();
  jornada: Jornada = new Date().getHours() < 12 ? 'MANANA' : 'TARDE';
  filtroLote = '';
  //LITROS ESCRITOS POR VACA (TEXTO TAL CUAL: ACEPTA COMA O PUNTO)
  litros: Record<string, string> = {};
  errores: Record<string, string> = {};
  errorDia = '';

  lotes: (LoteDTO & { ANIMALES_ACTIVOS: number })[] = [];
  private hato: AnimalDTO[] = [];
  private ordenosDelDia: OrdenoDTO[] = [];

  //ORDEÑO DE UNA SOLA VACA (DESDE LA FICHA CON ?animal=)
  uuidUna: string | null = null;
  //AL TERMINAR EL ORDEÑO DE UNA SOLA VACA SE MUESTRA EL RESUMEN
  guardadoUna: string | null = null;

  private subscripciones: Subscription[] = [];
  private subOrdenos: Subscription | null = null;

  ngOnInit(): void {
    this.uuidUna = this.route.snapshot.queryParamMap.get('animal');
    if (!this.puedeRegistrar) {
      this.cargando = false;
      return;
    }
    try {
      this.subscripciones.push(
        this.almacenLocal.observarAnimales(true).subscribe({
          next: lista => { this.hato = lista; this.cargando = false; this.cd.detectChanges(); },
          error: () => { this.cargando = false; this.cd.detectChanges(); },
        }),
        this.almacenLocal.observarLotes().subscribe({
          next: lista => { this.lotes = lista; this.cd.detectChanges(); },
        }),
      );
      this.observarOrdenos();
    } catch {
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
    this.subOrdenos?.unsubscribe();
  }

  //LOS ORDEÑOS DEL DIA ELEGIDO (SE VUELVE A SUSCRIBIR AL CAMBIAR EL DIA)
  private observarOrdenos(): void {
    this.subOrdenos?.unsubscribe();
    this.subOrdenos = this.almacenLocal.observarOrdenosDelDia(this.dia).subscribe({
      next: lista => { this.ordenosDelDia = lista; this.cd.detectChanges(); },
    });
  }

  //---------------------------------------------DIA Y JORNADA------------------------------------------------------------

  get hoy(): string {
    return hoyLocal();
  }

  cambiarDia(valor: string): void {
    this.dia = valor;
    this.errorDia = '';
    this.errores = {};
    if (valor && valor <= hoyLocal()) {
      this.observarOrdenos();
    } else {
      this.ordenosDelDia = [];
      this.errorDia = valor ? 'La fecha no puede ser futura' : 'Falta la fecha';
    }
    this.cd.detectChanges();
  }

  elegirJornada(jornada: Jornada): void {
    this.jornada = jornada;
    this.errores = {};
    this.cd.detectChanges();
  }

  nombreJornada(jornada: Jornada): string {
    return jornada === 'MANANA' ? 'mañana' : 'tarde';
  }

  get esHoy(): boolean {
    return this.dia === hoyLocal();
  }

  get diaLegible(): string {
    return fechaLegible(this.dia);
  }

  //---------------------------------------------LA LISTA DE VACAS--------------------------------------------------------

  //LAS QUE SE PUEDEN ORDEÑAR: HEMBRAS ACTIVAS QUE NO SON TERNERAS. CON ?animal=, SOLO ESA
  get vacas(): VacaOrdeno[] {
    const enJornada = new Map(this.ordenosDelDia.filter(o => o.JORNADA_ORDENO === this.jornada).map(o => [o.UUID_ANIMAL, Number(o.LITROS_ORDENO)]));
    return this.hato
      .filter(a => a.SEXO_ANIMAL === 'H' && categoriaAnimal(a) !== 'TERNERA')
      .filter(a => this.uuidUna ? a.UUID_ANIMAL === this.uuidUna : (!this.filtroLote || (this.filtroLote === 'SIN' ? !a.UUID_LOTE : a.UUID_LOTE === this.filtroLote)))
      .map(a => ({ animal: a, vista: aVista(a), litrosJornada: enJornada.has(a.UUID_ANIMAL) ? enJornada.get(a.UUID_ANIMAL)! : null }))
      .sort((x, y) => compararPorChapeta(x.vista, y.vista));
  }

  //EL ANIMAL PEDIDO POR LA URL CUANDO NO SE PUEDE ORDEÑAR (MACHO, TERNERA O YA NO ESTA EN LA FINCA)
  get motivoUna(): string | null {
    if (!this.uuidUna || this.cargando) {
      return null;
    }
    const a = this.hato.find(x => x.UUID_ANIMAL === this.uuidUna);
    if (!a) {
      return 'Ese animal no está en la finca (o ya salió): no se le puede registrar ordeño';
    }
    if (a.SEXO_ANIMAL !== 'H') {
      return 'El ordeño se registra a una vaca';
    }
    if (categoriaAnimal(a) === 'TERNERA') {
      return 'Es una ternera: no se ordeña';
    }
    return null;
  }

  get hayLotes(): boolean {
    return this.lotes.length > 0;
  }

  get haySinLote(): boolean {
    return this.hato.some(a => a.SEXO_ANIMAL === 'H' && !a.UUID_LOTE);
  }

  elegirLote(uuid: string): void {
    this.filtroLote = uuid;
    this.cd.detectChanges();
  }

  //---------------------------------------------TOTALES------------------------------------------------------------------

  private sumar(jornada: Jornada): number {
    return this.ordenosDelDia.filter(o => o.JORNADA_ORDENO === jornada).reduce((t, o) => t + Number(o.LITROS_ORDENO || 0), 0);
  }

  get litrosManana(): number {
    return this.redondear(this.sumar('MANANA'));
  }

  get litrosTarde(): number {
    return this.redondear(this.sumar('TARDE'));
  }

  get litrosDia(): number {
    return this.redondear(this.sumar('MANANA') + this.sumar('TARDE'));
  }

  //VACAS DE LA LISTA QUE AUN NO TIENEN ORDEÑO EN ESTA JORNADA
  get faltan(): number {
    return this.vacas.filter(v => v.litrosJornada === null).length;
  }

  get yaOrdenadas(): number {
    return this.vacas.filter(v => v.litrosJornada !== null).length;
  }

  //CUANTAS TIENEN LITROS ESCRITOS (LAS QUE SE VAN A GUARDAR)
  get porGuardar(): VacaOrdeno[] {
    return this.vacas.filter(v => v.litrosJornada === null && (this.litros[v.animal.UUID_ANIMAL] ?? '').trim() !== '');
  }

  get litrosPorGuardar(): number {
    return this.redondear(this.porGuardar.reduce((t, v) => t + (this.numero(this.litros[v.animal.UUID_ANIMAL]) ?? 0), 0));
  }

  private redondear(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private numero(texto: string | undefined): number | null {
    const limpio = (texto ?? '').trim().replace(',', '.');
    if (!limpio) {
      return null;
    }
    const n = Number(limpio);
    return isNaN(n) ? null : n;
  }

  alEscribir(uuid: string): void {
    delete this.errores[uuid];
  }

  //ENTER EN UN CAMPO: PASA A LA SIGUIENTE VACA (COMO SI SE PASARAN UNA POR UNA)
  siguiente(evento: Event): void {
    evento.preventDefault();
    const campos = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-litros]'));
    const actual = evento.target as HTMLInputElement;
    const posicion = campos.indexOf(actual);
    const proximo = campos[posicion + 1];
    if (proximo) {
      proximo.focus();
      proximo.select();
    } else {
      actual.blur();
    }
  }

  //---------------------------------------------GUARDAR------------------------------------------------------------------

  //LO MISMO QUE FUN_VALIDAR_ORDENOS PARA CADA VACA CON LITROS ESCRITOS
  private validar(lista: VacaOrdeno[]): boolean {
    const e: Record<string, string> = {};
    this.errorDia = '';
    if (!this.dia) {
      this.errorDia = 'Falta la fecha';
    } else if (this.dia > hoyLocal()) {
      this.errorDia = 'La fecha no puede ser futura';
    }
    const enJornada = new Set(this.ordenosDelDia.filter(o => o.JORNADA_ORDENO === this.jornada).map(o => o.UUID_ANIMAL));
    const [a, m, d] = (this.dia || hoyLocal()).split('-').map(Number);
    const fechaDia = new Date(a, m - 1, d);
    for (const v of lista) {
      const uuid = v.animal.UUID_ANIMAL;
      const litros = this.numero(this.litros[uuid]);
      if (this.dia && this.dia < v.animal.FECHA_NACIMIENTO.slice(0, 10)) {
        e[uuid] = `La fecha es anterior al nacimiento de ${etiquetaAnimal(v.animal)} (${ddmmaaaa(v.animal.FECHA_NACIMIENTO)})`;
      } else if (categoriaAnimal(v.animal) !== 'VACA' && mesesCumplidos(v.animal.FECHA_NACIMIENTO, fechaDia) < 12) {
        e[uuid] = 'En esa fecha era una ternera: no se ordeña';
      } else if (enJornada.has(uuid)) {
        e[uuid] = `Ya se registró el ordeño de la ${this.nombreJornada(this.jornada)} del ${ddmmaaaa(this.dia)} de ${etiquetaAnimal(v.animal)}`;
      } else if (litros === null || litros < 0 || litros > 60) {
        e[uuid] = 'Escribe los litros (de 0 a 60)';
      }
    }
    this.errores = e;
    return !this.errorDia && Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    const lista = this.porGuardar;
    if (this.guardando) {
      return;
    }
    if (lista.length === 0) {
      this.toast.warning('Escribe los litros de al menos una vaca.', 'Falta', 5000, true, true, true);
      return;
    }
    if (!this.validar(lista)) {
      this.toast.warning('Revisa las vacas marcadas en rojo.', 'Falta', 5000, true, true, true);
      this.cd.detectChanges();
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    const fecha = `${this.dia}T${HORA_JORNADA[this.jornada]}`;
    let guardadas = 0;
    let total = 0;
    try {
      for (const v of lista) {
        const litros = this.numero(this.litros[v.animal.UUID_ANIMAL])!;
        await this.eventosService.registrarOrdeno({
          uuid_animal: v.animal.UUID_ANIMAL, jornada_ordeno: this.jornada, litros_ordeno: litros, fecha_evento: fecha, observacion: null,
        });
        delete this.litros[v.animal.UUID_ANIMAL];
        guardadas++;
        total += litros;
      }
      const texto = `${guardadas} ${guardadas === 1 ? 'ordeño' : 'ordeños'} de la ${this.nombreJornada(this.jornada)}: ${this.redondear(total)} litros.`;
      this.toast.success(`Guardado en el celular: ${texto}`, 'Éxito', 5000, true, true, true);
      if (this.uuidUna) {
        this.guardadoUna = texto;
      }
    } catch {
      this.toast.danger(guardadas > 0
        ? `Se guardaron ${guardadas}, pero las demás no. Revisa la lista e inténtalo otra vez.`
        : 'No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  //DE UNA SOLA VACA A TODAS
  verTodas(): void {
    this.uuidUna = null;
    this.guardadoUna = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.cd.detectChanges();
  }

  verFicha(): void {
    if (this.uuidUna) {
      this.router.navigate(['/app/hato', this.uuidUna]);
    }
  }
}
