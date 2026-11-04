import { ChangeDetectorRef, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { AnimalDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { ahoraLocal, DatosPesajeNuevo, HatoService, pesoPorCinta } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { AnimalVista, aVista, compararPorChapeta, fechaLegible } from '../hato/hato-vista';

type Metodo = 'BASCULA' | 'CINTA';
type CampoError = 'kilos' | 'perimetro' | 'fecha' | 'nota' | 'animal';

//PESE: ELEGIR EL ANIMAL POR CHAPETA, PESO CON BASCULA O CON CINTA, FECHA DE HOY POR DEFECTO
//PASO 1 EL ANIMAL, PASO 2 EL PESO. SE GUARDA EN EL CELULAR (SIN SEÑAL) Y VA A LA BANDEJA
//LAS REGLAS SON LAS DE FUN_VALIDAR_PESAJES Y FUN_VALIDAR_EVENTO_ANIMAL
@Component({
  selector: 'app-pesar',
  standalone: false,
  templateUrl: './pesar.component.html',
})
export class PesarComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private hatoService = inject(HatoService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  @ViewChild('campoChapeta') campoChapeta?: ElementRef<HTMLInputElement>;
  @ViewChild('campoPeso') campoPeso?: ElementRef<HTMLInputElement>;

  puedePesar = this.seguridadService.tienePermiso(4, 'guardar');
  cargando = true;
  guardando = false;
  paso: 1 | 2 = 1;
  busqueda = '';
  metodo: Metodo = 'BASCULA';
  errores: Partial<Record<CampoError, string>> = {};

  private hato: AnimalDTO[] = [];
  animal: AnimalDTO | null = null;
  vista: AnimalVista | null = null;
  //ULTIMO PESAJE GUARDADO, PARA OFRECER "PESAR OTRO" O "VER LA FICHA"
  guardado: { uuidAnimal: string; texto: string } | null = null;

  private uuidPedido: string | null = null;
  private subscripciones: Subscription[] = [];

  form = new FormGroup({
    kilos: new FormControl('', { nonNullable: true }),
    perimetro: new FormControl('', { nonNullable: true }),
    fecha: new FormControl(ahoraLocal(), { nonNullable: true }),
    nota: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.uuidPedido = this.route.snapshot.queryParamMap.get('animal');
    try {
      this.subscripciones.push(
        this.almacenLocal.observarAnimales(false).subscribe({
          next: lista => {
            this.hato = lista;
            this.cargando = false;
            //DESDE LA FICHA O DESDE "ANIMAL NUEVO": EL ANIMAL YA VIENE ELEGIDO
            if (this.uuidPedido) {
              const pedido = lista.find(a => a.UUID_ANIMAL === this.uuidPedido);
              this.uuidPedido = null;
              if (pedido) {
                this.elegir(pedido);
              }
            } else if (this.animal) {
              //SE REFRESCA EL ELEGIDO (POR SI CAMBIO AL SINCRONIZAR)
              const actual = lista.find(a => a.UUID_ANIMAL === this.animal!.UUID_ANIMAL);
              if (actual) {
                this.animal = actual;
                this.vista = aVista(actual);
              }
            }
            this.cd.detectChanges();
            if (this.paso === 1) {
              this.enfocarChapeta();
            }
          },
          error: () => { this.cargando = false; this.cd.detectChanges(); },
        }),
      );
    } catch {
      this.cargando = false;
    }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
  }

  //---------------------------------------------PASO 1: EL ANIMAL--------------------------------------------------------

  //LA CHAPETA EXACTA PRIMERO, LUEGO LAS QUE EMPIEZAN IGUAL Y LOS NOMBRES (MAXIMO 6). SOLO ANIMALES DE LA FINCA (ACTIVOS)
  get coincidencias(): AnimalVista[] {
    const texto = this.busqueda.trim().toLowerCase();
    if (!texto) {
      return [];
    }
    const activos = this.hato.filter(a => a.ESTADO_ANIMAL === 'ACTIVO').map(aVista);
    const exacta = activos.filter(a => (a.chapeta ?? '').toLowerCase() === texto);
    const empiezan = activos.filter(a => !exacta.includes(a) && (a.chapeta ?? '').toLowerCase().startsWith(texto)).sort(compararPorChapeta);
    const nombres = activos.filter(a => !exacta.includes(a) && !empiezan.includes(a) && a.textoBusqueda.includes(texto)).sort(compararPorChapeta);
    return [...exacta, ...empiezan, ...nombres].slice(0, 6);
  }

  //SI LA CHAPETA ES DE UN ANIMAL QUE YA NO ESTA EN LA FINCA, SE AVISA
  get chapetaNoActiva(): AnimalDTO | null {
    const texto = this.busqueda.trim().toUpperCase();
    if (!texto) {
      return null;
    }
    return this.hato.find(a => a.CHAPETA_ANIMAL === texto && a.ESTADO_ANIMAL !== 'ACTIVO') ?? null;
  }

  get hayActivos(): boolean {
    return this.hato.some(a => a.ESTADO_ANIMAL === 'ACTIVO');
  }

  //ENTER EN LA CHAPETA: SI HAY UNA SOLA COINCIDENCIA (O LA EXACTA), SE ELIGE
  alEnter(): void {
    const lista = this.coincidencias;
    if (lista.length === 0) {
      return;
    }
    const exacta = lista.find(a => (a.chapeta ?? '').toLowerCase() === this.busqueda.trim().toLowerCase());
    if (exacta || lista.length === 1) {
      this.elegirPorUuid((exacta ?? lista[0]).uuid);
    }
  }

  elegirPorUuid(uuid: string): void {
    const animal = this.hato.find(a => a.UUID_ANIMAL === uuid);
    if (animal) {
      this.elegir(animal);
    }
  }

  private elegir(animal: AnimalDTO): void {
    this.animal = animal;
    this.vista = aVista(animal);
    this.errores = {};
    this.paso = 2;
    if (animal.ESTADO_ANIMAL !== 'ACTIVO') {
      this.errores.animal = 'Este animal ya no está en la finca: no se le pueden registrar pesajes';
    }
    this.cd.detectChanges();
    setTimeout(() => this.campoPeso?.nativeElement.focus(), 50);
  }

  cambiarAnimal(): void {
    this.animal = null;
    this.vista = null;
    this.errores = {};
    this.paso = 1;
    this.cd.detectChanges();
    this.enfocarChapeta();
  }

  private enfocarChapeta(): void {
    setTimeout(() => this.campoChapeta?.nativeElement.focus(), 50);
  }

  //---------------------------------------------PASO 2: EL PESO----------------------------------------------------------

  elegirMetodo(metodo: Metodo): void {
    this.metodo = metodo;
    delete this.errores.kilos;
    delete this.errores.perimetro;
    this.cd.detectChanges();
    setTimeout(() => this.campoPeso?.nativeElement.focus(), 50);
  }

  //PESO ESTIMADO EN VIVO CON LA CINTA (SOLO PARA MOSTRAR: LA BASE LO CALCULA CON SU COEFICIENTE)
  get pesoEstimado(): number | null {
    const cm = this.numero(this.form.controls.perimetro.value);
    return cm !== null && cm >= 50 && cm <= 300 ? pesoPorCinta(cm) : null;
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

  private validar(): boolean {
    const v = this.form.getRawValue();
    const e: Partial<Record<CampoError, string>> = {};
    const a = this.animal;
    if (!a) {
      e.animal = 'Elige el animal';
    } else if (a.ESTADO_ANIMAL !== 'ACTIVO') {
      e.animal = 'Este animal ya no está en la finca: no se le pueden registrar pesajes';
    }
    if (this.metodo === 'BASCULA') {
      const kg = this.numero(v.kilos);
      if (kg === null || kg <= 0 || kg > 1500) {
        e.kilos = 'Escribe un peso entre 1 y 1500 kilos';
      }
    } else {
      const cm = this.numero(v.perimetro);
      if (cm === null || cm < 50 || cm > 300) {
        e.perimetro = 'Con cinta, escribe el perímetro del pecho en centímetros (de 50 a 300)';
      }
    }
    if (!v.fecha) {
      e.fecha = 'Falta la fecha';
    } else if (v.fecha > ahoraLocal()) {
      e.fecha = 'La fecha no puede ser futura';
    } else if (a && v.fecha.slice(0, 10) < a.FECHA_NACIMIENTO.slice(0, 10)) {
      e.fecha = `La fecha es anterior al nacimiento (${fechaLegible(a.FECHA_NACIMIENTO)})`;
    }
    if (v.nota.length > 300) {
      e.nota = 'La nota es demasiado larga (máximo 300 caracteres)';
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    if (this.guardando || !this.validar() || !this.animal) {
      this.cd.detectChanges();
      return;
    }
    const v = this.form.getRawValue();
    const cinta = this.metodo === 'CINTA';
    const datos: DatosPesajeNuevo = {
      uuid_animal: this.animal.UUID_ANIMAL,
      peso_kg: cinta ? null : this.numero(v.kilos),
      estimado_cinta: cinta ? 'SI' : 'NO',
      perimetro_cm: cinta ? this.numero(v.perimetro) : null,
      fecha_evento: v.fecha,
      observacion: v.nota.trim() || null,
    };
    this.guardando = true;
    this.cd.detectChanges();
    try {
      await this.hatoService.registrarPesaje(datos);
      const peso = cinta ? `unos ${this.pesoEstimado} kg (cinta)` : `${datos.peso_kg} kg`;
      const quien = this.vista?.chapeta ? `chapeta ${this.vista.chapeta}` : (this.vista?.nombre ?? 'el animal');
      this.guardado = { uuidAnimal: this.animal.UUID_ANIMAL, texto: `${quien}: ${peso}` };
      this.toast.success(`Pesaje guardado: ${quien}, ${peso}.`, 'Éxito', 5000, true, true, true);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  //VUELVE AL PASO 1 VACIO, CON EL MISMO METODO Y LA HORA DE AHORA
  pesarOtro(): void {
    this.guardado = null;
    this.animal = null;
    this.vista = null;
    this.busqueda = '';
    this.errores = {};
    this.paso = 1;
    this.form.reset({ kilos: '', perimetro: '', fecha: ahoraLocal(), nota: '' });
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.cd.detectChanges();
    this.enfocarChapeta();
  }

  verFicha(): void {
    if (this.guardado) {
      this.router.navigate(['/app/hato', this.guardado.uuidAnimal]);
    }
  }
}
