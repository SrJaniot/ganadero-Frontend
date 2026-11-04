import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NgToastService } from 'ng-angular-popup';
import { AnimalDTO, LoteDTO, RazaDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { DatosAnimalNuevo, HatoService, hoyLocal, mesesCumplidos } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { AnimalVista, aVista, compararPorChapeta, fechaLegible, fechaLocalDe } from './hato-vista';

const PATRON_CHAPETA = /^[A-Za-z0-9-]{1,20}$/;
//LA MADRE DEBE SER AL MENOS 15 MESES MAYOR QUE LA CRIA (FUN_VALIDAR_ANIMALES)
const MESES_MADRE = 15;

type CampoError = 'chapeta' | 'nombre' | 'sexo' | 'nacimiento' | 'edad' | 'llegada' | 'madre' | 'padre';
type TipoPadre = 'NINGUNO' | 'FINCA' | 'AFUERA';

//"2026-11-04" MENOS N MESES, COMO EL INTERVAL DE POSTGRESQL (EL 31 PASA AL ULTIMO DIA DEL MES SI NO EXISTE)
function restarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const primero = new Date(a, m - 1 - meses, 1);
  const ultimoDia = new Date(primero.getFullYear(), primero.getMonth() + 1, 0).getDate();
  return fechaLocalDe(new Date(primero.getFullYear(), primero.getMonth(), Math.min(d, ultimoDia)));
}

//ANIMAL NUEVO (COMPRADO O NACIDO SIN PARTO REGISTRADO) Y EDITAR (SOLO EL DUEÑO, data.modo = 'editar'): MISMO FORMULARIO
//SE GUARDA EN EL CELULAR Y VA A LA BANDEJA. LAS REGLAS SON LAS DE FUN_VALIDAR_ANIMALES (LA BASE LAS VUELVE A REVISAR AL SUBIR)
@Component({
  selector: 'app-nuevo-animal',
  standalone: false,
  templateUrl: './nuevo-animal.component.html',
})
export class NuevoAnimalComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private hatoService = inject(HatoService);
  private seguridadService = inject(SeguridadService);
  private fincaActual = inject(FincaActualService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  modoEditar = this.route.snapshot.data['modo'] === 'editar';
  uuidEditar = this.modoEditar ? (this.route.snapshot.paramMap.get('uuid') ?? '') : '';
  //CREAR: DUEÑO Y VAQUERO (MENU 3 GUARDAR). EDITAR: SOLO EL DUEÑO DE LA FINCA
  puedeCrearAnimal = this.modoEditar ? this.fincaActual.esDuenio : this.seguridadService.tienePermiso(3, 'guardar');
  cargando = this.modoEditar;
  noExiste = false;
  guardando = false;
  razas: RazaDTO[] = [];
  lotes: LoteDTO[] = [];
  errores: Partial<Record<CampoError, string>> = {};
  hoy = hoyLocal();
  hace25 = fechaLocalDe(new Date(new Date().getFullYear() - 25, new Date().getMonth(), new Date().getDate()));

  //EL HATO DEL CELULAR (SIN ANULADOS) PARA ELEGIR MADRE Y PADRE Y REVISAR LA CHAPETA
  private hato: AnimalDTO[] = [];
  animalEditado: AnimalDTO | null = null;
  //EN EDITAR CON FECHA APROXIMADA: SI NO SE TOCA LA EDAD, SE CONSERVA LA FECHA QUE YA TENIA
  private fechaEstimadaOriginal: { meses: string; fecha: string } | null = null;

  buscarMadre = '';
  buscarPadre = '';
  //AVISO CUANDO SE PUSO SOLO EL LOTE DE LA MADRE
  loteSugerido = '';

  //CUANDO SE GUARDA: UUID Y NOMBRE PARA OFRECER "PESARLO AHORA"
  guardado: { uuid: string; texto: string } | null = null;

  form = new FormGroup({
    chapeta: new FormControl('', { nonNullable: true }),
    nombre: new FormControl('', { nonNullable: true }),
    sexo: new FormControl<'' | 'H' | 'M'>('', { nonNullable: true }),
    sabeFecha: new FormControl(true, { nonNullable: true }),
    fechaNacimiento: new FormControl('', { nonNullable: true }),
    edadMeses: new FormControl('', { nonNullable: true }),
    idRaza: new FormControl('', { nonNullable: true }),
    origen: new FormControl<'NACIDO' | 'COMPRADO'>('NACIDO', { nonNullable: true }),
    fechaIngreso: new FormControl(hoyLocal(), { nonNullable: true }),
    uuidLote: new FormControl('', { nonNullable: true }),
    uuidMadre: new FormControl('', { nonNullable: true }),
    tipoPadre: new FormControl<TipoPadre>('NINGUNO', { nonNullable: true }),
    uuidPadre: new FormControl('', { nonNullable: true }),
    padreExterno: new FormControl('', { nonNullable: true }),
  });

  private subscripcion: Subscription | null = null;

  ngOnInit(): void {
    if (!this.puedeCrearAnimal) {
      this.cargando = false;
      return;
    }
    this.cargarRazas();
    this.almacenLocal.lotes()
      .then(lotes => { this.lotes = lotes.sort((a, b) => a.NOM_LOTE.localeCompare(b.NOM_LOTE, 'es')); this.cd.detectChanges(); })
      .catch(() => { this.lotes = []; this.cd.detectChanges(); });
    try {
      this.subscripcion = this.almacenLocal.observarAnimales(false).subscribe({
        next: lista => {
          this.hato = lista;
          if (this.modoEditar && !this.animalEditado) {
            this.rellenar();
          }
          this.cd.detectChanges();
        },
        error: () => { this.cargando = false; this.noExiste = this.modoEditar; this.cd.detectChanges(); },
      });
    } catch {
      this.cargando = false;
      this.noExiste = this.modoEditar;
    }
  }

  ngOnDestroy(): void {
    this.subscripcion?.unsubscribe();
  }

  private cargarRazas(): void {
    this.almacenLocal.razas()
      .then(razas => { this.razas = razas; this.cd.detectChanges(); })
      .catch(() => { this.razas = []; this.cd.detectChanges(); });
  }

  //EDITAR: EL FORMULARIO CON LO QUE TIENE EL ANIMAL EN EL CELULAR
  private rellenar(): void {
    const a = this.hato.find(x => x.UUID_ANIMAL === this.uuidEditar);
    this.cargando = false;
    if (!a) {
      this.noExiste = true;
      return;
    }
    this.animalEditado = a;
    const estimada = a.FECHA_NACIMIENTO_ESTIMADA === 'SI';
    const meses = String(mesesCumplidos(a.FECHA_NACIMIENTO));
    this.fechaEstimadaOriginal = estimada ? { meses, fecha: a.FECHA_NACIMIENTO.slice(0, 10) } : null;
    this.form.setValue({
      chapeta: a.CHAPETA_ANIMAL ?? '',
      nombre: a.NOM_ANIMAL ?? '',
      sexo: a.SEXO_ANIMAL,
      sabeFecha: !estimada,
      fechaNacimiento: a.FECHA_NACIMIENTO.slice(0, 10),
      edadMeses: estimada ? meses : '',
      idRaza: a.ID_RAZA !== null && a.ID_RAZA !== undefined ? String(a.ID_RAZA) : '',
      origen: a.ORIGEN_ANIMAL,
      fechaIngreso: (a.FECHA_INGRESO_ANIMAL ?? hoyLocal()).slice(0, 10),
      uuidLote: a.UUID_LOTE ?? '',
      uuidMadre: a.UUID_MADRE ?? '',
      tipoPadre: a.UUID_PADRE ? 'FINCA' : a.PADRE_EXTERNO ? 'AFUERA' : 'NINGUNO',
      uuidPadre: a.UUID_PADRE ?? '',
      padreExterno: a.PADRE_EXTERNO ?? '',
    });
  }

  get v() {
    return this.form.getRawValue();
  }

  elegirSexo(sexo: 'H' | 'M'): void {
    this.form.controls.sexo.setValue(sexo);
    delete this.errores.sexo;
  }

  elegirSabeFecha(sabe: boolean): void {
    this.form.controls.sabeFecha.setValue(sabe);
    delete this.errores.nacimiento;
    delete this.errores.edad;
  }

  elegirOrigen(origen: 'NACIDO' | 'COMPRADO'): void {
    this.form.controls.origen.setValue(origen);
    delete this.errores.llegada;
    if (origen === 'NACIDO') {
      this.sugerirLoteDeMadre();
    }
  }

  //LA FECHA DE NACIMIENTO QUE SE MANDA: LA EXACTA O LA CALCULADA CON LA EDAD EN MESES
  get fechaNacimientoCalculada(): string | null {
    const v = this.v;
    if (v.sabeFecha) {
      return v.fechaNacimiento || null;
    }
    const meses = Number(v.edadMeses.trim());
    if (v.edadMeses.trim() === '' || !Number.isInteger(meses) || meses < 0 || meses > 300) {
      return null;
    }
    if (this.fechaEstimadaOriginal && this.fechaEstimadaOriginal.meses === v.edadMeses.trim()) {
      return this.fechaEstimadaOriginal.fecha;
    }
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - meses);
    return fechaLocalDe(d);
  }

  get fechaNacimientoLegible(): string {
    return fechaLegible(this.fechaNacimientoCalculada);
  }

  //---------------------------------------------MADRE Y PADRE-----------------------------------------------------------------

  private get hatoVista(): AnimalVista[] {
    return this.hato.map(aVista).sort(compararPorChapeta);
  }

  //CANDIDATAS: HEMBRAS EN LA FINCA (Y LA MADRE QUE YA TENIA, AUNQUE SE HAYA VENDIDO), NUNCA EL MISMO ANIMAL
  private candidatos(sexo: 'H' | 'M', actual: string, texto: string): AnimalVista[] {
    const t = texto.trim().toLowerCase();
    if (!t) {
      return [];
    }
    return this.hatoVista
      .filter(a => a.sexo === sexo && a.uuid !== this.uuidEditar && (a.estado === 'ACTIVO' || a.uuid === actual))
      .filter(a => (a.chapeta ?? '').toLowerCase().startsWith(t) || a.textoBusqueda.includes(t))
      .slice(0, 8);
  }

  get candidatasMadre(): AnimalVista[] {
    return this.candidatos('H', this.v.uuidMadre, this.buscarMadre);
  }

  get candidatosPadre(): AnimalVista[] {
    return this.candidatos('M', this.v.uuidPadre, this.buscarPadre);
  }

  get madreElegida(): AnimalVista | null {
    const uuid = this.v.uuidMadre;
    const a = uuid ? this.hato.find(x => x.UUID_ANIMAL === uuid) : null;
    return a ? aVista(a) : null;
  }

  get padreElegido(): AnimalVista | null {
    const uuid = this.v.uuidPadre;
    const a = uuid ? this.hato.find(x => x.UUID_ANIMAL === uuid) : null;
    return a ? aVista(a) : null;
  }

  //SI YA SE SABE CUANDO NACIO: ¿LA MADRE ES AL MENOS 15 MESES MAYOR?
  madreMuyJoven(uuidMadre: string): boolean {
    const nacimiento = this.fechaNacimientoCalculada;
    const madre = this.hato.find(x => x.UUID_ANIMAL === uuidMadre);
    if (!nacimiento || !madre) {
      return false;
    }
    return madre.FECHA_NACIMIENTO.slice(0, 10) > restarMeses(nacimiento, MESES_MADRE);
  }

  elegirMadre(uuid: string): void {
    this.form.controls.uuidMadre.setValue(uuid);
    this.buscarMadre = '';
    delete this.errores.madre;
    this.sugerirLoteDeMadre();
  }

  quitarMadre(): void {
    this.form.controls.uuidMadre.setValue('');
    this.loteSugerido = '';
    delete this.errores.madre;
  }

  //SI NACIO EN LA FINCA, LO NORMAL ES QUE ANDE CON LA MADRE: SE PONE SU LOTE SI TODAVIA NO TIENE (SE PUEDE CAMBIAR)
  private sugerirLoteDeMadre(): void {
    const madre = this.hato.find(x => x.UUID_ANIMAL === this.v.uuidMadre);
    if (this.v.origen !== 'NACIDO' || !madre?.UUID_LOTE || this.v.uuidLote) {
      return;
    }
    const lote = this.lotes.find(l => l.UUID_LOTE === madre.UUID_LOTE);
    if (lote) {
      this.form.controls.uuidLote.setValue(lote.UUID_LOTE);
      this.loteSugerido = lote.NOM_LOTE;
    }
  }

  elegirTipoPadre(tipo: TipoPadre): void {
    this.form.controls.tipoPadre.setValue(tipo);
    delete this.errores.padre;
  }

  elegirPadre(uuid: string): void {
    this.form.controls.uuidPadre.setValue(uuid);
    this.buscarPadre = '';
    delete this.errores.padre;
  }

  quitarPadre(): void {
    this.form.controls.uuidPadre.setValue('');
  }

  nombreAnimal(a: AnimalVista): string {
    return a.nombre || (a.chapeta ? 'Chapeta ' + a.chapeta : 'Sin chapeta');
  }

  //---------------------------------------------GUARDAR-----------------------------------------------------------------------

  //MISMAS REGLAS QUE FUN_VALIDAR_ANIMALES, CON LOS MISMOS MENSAJES
  private validar(): boolean {
    const v = this.v;
    const e: Partial<Record<CampoError, string>> = {};
    const chapeta = v.chapeta.trim();
    const nombre = v.nombre.trim();
    if (chapeta && !PATRON_CHAPETA.test(chapeta)) {
      e.chapeta = 'La chapeta solo puede tener letras, números y guiones (máximo 20)';
    }
    if (nombre.length > 60) {
      e.nombre = 'El nombre es demasiado largo (máximo 60 caracteres)';
    }
    if (!chapeta && !nombre) {
      e.chapeta = 'Escribe la chapeta o un nombre para reconocer al animal';
    }
    if (!v.sexo) {
      e.sexo = 'Elige si es hembra o macho';
    }
    const nacimiento = this.fechaNacimientoCalculada;
    if (v.sabeFecha) {
      if (!nacimiento) {
        e.nacimiento = 'Escribe la fecha de nacimiento (si no la sabes, toca «No sé la fecha»)';
      } else if (nacimiento > this.hoy) {
        e.nacimiento = 'La fecha de nacimiento no puede ser futura';
      } else if (nacimiento < this.hace25) {
        e.nacimiento = 'Revisa la fecha de nacimiento: el animal tendría más de 25 años';
      }
    } else if (!nacimiento) {
      e.edad = 'Escribe la edad en meses (de 0 a 300)';
    }
    //MADRE: HEMBRA DE LA FINCA, AL MENOS 15 MESES MAYOR, NUNCA EL MISMO ANIMAL
    if (v.uuidMadre) {
      const madre = this.hato.find(x => x.UUID_ANIMAL === v.uuidMadre);
      if (!madre) {
        e.madre = 'La madre no existe en esta finca';
      } else if (madre.SEXO_ANIMAL !== 'H') {
        e.madre = 'La madre debe ser una hembra';
      } else if (v.uuidMadre === this.uuidEditar) {
        e.madre = 'Un animal no puede ser su propia madre';
      } else if (this.madreMuyJoven(v.uuidMadre)) {
        e.madre = 'La madre es demasiado joven para ser la madre de este animal';
      }
    }
    //PADRE: UN MACHO DE LA FINCA O EL DE AFUERA, NO LOS DOS (EL FORMULARIO SOLO MANDA EL QUE ESTA ELEGIDO)
    if (v.tipoPadre === 'FINCA') {
      const padre = this.hato.find(x => x.UUID_ANIMAL === v.uuidPadre);
      if (!v.uuidPadre) {
        e.padre = 'Elige el padre de la lista o toca «No sé»';
      } else if (!padre) {
        e.padre = 'El padre no existe en esta finca';
      } else if (padre.SEXO_ANIMAL !== 'M') {
        e.padre = 'El padre debe ser un macho';
      } else if (v.uuidPadre === this.uuidEditar) {
        e.padre = 'Un animal no puede ser su propio padre';
      }
    } else if (v.tipoPadre === 'AFUERA') {
      const externo = v.padreExterno.trim();
      if (!externo) {
        e.padre = 'Escribe la pajilla o el toro de afuera, o toca «No sé»';
      } else if (externo.length > 80) {
        e.padre = 'El padre de afuera es demasiado largo (máximo 80 caracteres)';
      }
    }
    if (v.origen === 'COMPRADO') {
      if (!v.fechaIngreso) {
        e.llegada = 'Escribe la fecha en que llegó a la finca';
      } else if (v.fechaIngreso > this.hoy || (nacimiento && v.fechaIngreso < nacimiento)) {
        e.llegada = 'La fecha de llegada debe estar entre el nacimiento y hoy';
      }
    }
    this.errores = e;
    return Object.keys(e).length === 0;
  }

  async guardar(): Promise<void> {
    if (this.guardando || !this.validar()) {
      this.cd.detectChanges();
      return;
    }
    const v = this.v;
    const chapeta = v.chapeta.trim().toUpperCase() || null;
    //CHAPETA NO REPETIDA EN EL CELULAR (LA BASE TAMBIEN LO REVISA EN TODA LA FINCA). EN EDITAR NO CUENTA EL MISMO ANIMAL
    if (chapeta && this.hato.some(a => a.CHAPETA_ANIMAL === chapeta && a.UUID_ANIMAL !== this.uuidEditar)) {
      this.errores = { chapeta: `La chapeta ${chapeta} ya la tiene otro animal de la finca` };
      this.cd.detectChanges();
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    try {
      const datos: DatosAnimalNuevo = {
        chapeta_animal: chapeta,
        nom_animal: v.nombre.trim() || null,
        sexo_animal: v.sexo as 'H' | 'M',
        fecha_nacimiento: this.fechaNacimientoCalculada!,
        fecha_nacimiento_estimada: v.sabeFecha ? 'NO' : 'SI',
        id_raza: v.idRaza ? Number(v.idRaza) : null,
        uuid_lote: v.uuidLote || null,
        uuid_madre: v.uuidMadre || null,
        uuid_padre: v.tipoPadre === 'FINCA' ? (v.uuidPadre || null) : null,
        padre_externo: v.tipoPadre === 'AFUERA' ? (v.padreExterno.trim() || null) : null,
        origen_animal: v.origen,
        fecha_ingreso_animal: v.origen === 'COMPRADO' ? v.fechaIngreso : null,
      };
      const texto = chapeta ? `chapeta ${chapeta}` : (datos.nom_animal ?? 'el animal');
      if (this.modoEditar) {
        await this.hatoService.editarAnimal(this.uuidEditar, datos);
        this.toast.success(`Listo: los cambios de ${texto} quedaron guardados. Se suben cuando haya señal.`, 'Éxito', 5000, true, true, true);
        this.router.navigate(['/app/hato', this.uuidEditar]);
        return;
      }
      const uuid = await this.hatoService.crearAnimal(datos);
      this.guardado = { uuid, texto };
      this.toast.success(`Listo: ${texto} quedó en el hato. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
    } catch (e: any) {
      this.toast.danger(e?.message && this.modoEditar ? e.message : 'No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  get rutaVolver(): string[] {
    return this.modoEditar && this.uuidEditar ? ['/app/hato', this.uuidEditar] : ['/app/hato'];
  }

  pesarAhora(): void {
    if (this.guardado) {
      this.router.navigate(['/app/pesar'], { queryParams: { animal: this.guardado.uuid } });
    }
  }

  otroAnimal(): void {
    this.guardado = null;
    this.errores = {};
    this.buscarMadre = '';
    this.buscarPadre = '';
    this.loteSugerido = '';
    this.form.reset();
    this.cd.detectChanges();
  }
}
