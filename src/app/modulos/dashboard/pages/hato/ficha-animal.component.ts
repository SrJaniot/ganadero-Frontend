import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';
import { NgToastService } from 'ng-angular-popup';
import { AnimalDTO, EventosAnimal, OrdenoDTO, TipoRegistro } from '../../../../Modelos/GanaderoModel';
import { DIAS_GESTACION, EventosService, sumarDias } from '../../../../servicios/eventos.service';
import { sumarMeses } from '../eventos/reglas-eventos';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { categoriaAnimal, HatoService, hoyLocal, reducirImagen } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { SincronizacionService } from '../../../../servicios/sincronizacion.service';
import { AnimalVista, aVista, edadLegible, fechaLegible, nombreEstado, nombreSexo } from './hato-vista';

type TipoEvento = Exclude<TipoRegistro, 'LOTE' | 'ANIMAL'>;

//LO QUE SE PUEDE ANULAR DE UN PUNTO DE LA LINEA (EL ORDEÑO DEL DIA TIENE UNO POR JORNADA)
interface Anulable {
  tipo: TipoEvento;
  uuid: string;
  texto: string;          //"Anular" O "Anular la mañana"
  descripcion: string;    //PARA EL MODAL Y EL TOAST: "el ordeño de la mañana del 4 nov 2026"
}

//UN PUNTO DE LA LINEA DE TIEMPO (LO MAS NUEVO ARRIBA)
interface EventoVista {
  clave: string;
  fecha: string;          //PARA ORDENAR (AAAA-MM-DD O AAAA-MM-DDTHH:mm)
  fechaTexto: string;
  icono: string;
  titulo: string;
  detalle: string | null;
  cinta: boolean;
  pendiente: boolean;
  aviso?: string | null;                              //"SIN VENDER LECHE HASTA..." (RETIRO VIGENTE)
  enlace?: { uuid: string; texto: string } | null;    //LA CRIA DE UN PARTO
  anulables?: Anulable[];
}

//LA MADRE O EL PADRE PARA MOSTRAR: TEXTO Y, SI ESTA EN EL CELULAR, SU UUID PARA IR A SU FICHA
interface Pariente {
  uuid: string | null;
  texto: string;
}

//FICHA DEL ANIMAL: FOTO, DATOS, FAMILIA, CRIAS Y SU LINEA DE TIEMPO (SIN SEÑAL, CON LO DEL CELULAR)
//EL DUEÑO EDITA, ANULA (SOLO REGISTROS POR ERROR) Y CAMBIA LA FOTO (ESTO ULTIMO CON SEÑAL Y CUANDO EL ANIMAL YA SUBIO)
@Component({
  selector: 'app-ficha-animal',
  standalone: false,
  templateUrl: './ficha-animal.component.html',
})
export class FichaAnimalComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private almacenLocal = inject(AlmacenLocalService);
  private hatoService = inject(HatoService);
  private fincaActual = inject(FincaActualService);
  private sincronizacion = inject(SincronizacionService);
  private seguridadService = inject(SeguridadService);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  noExiste = false;
  animal: AnimalDTO | null = null;
  vista: AnimalVista | null = null;
  private eventosAnimal: EventosAnimal | null = null;
  private animalesFinca = new Map<string, AnimalDTO>();
  private nombresVacuna = new Map<number, string>();
  crias: AnimalVista[] = [];
  eventos: EventoVista[] = [];
  madre: Pariente | null = null;
  padre: Pariente | null = null;
  nombreLote: string | null = null;
  puedePesar = this.seguridadService.tienePermiso(4, 'guardar');
  esDuenio = this.fincaActual.esDuenio;
  enLinea = navigator.onLine;

  //FOTO
  urlFoto: string | null = null;
  cargandoFoto = false;
  subiendoFoto = false;
  private archivoFotoMostrada: string | null = null;

  //ANULAR
  confirmarAnular = false;
  anulando = false;
  //ANULAR UN EVENTO DE LA LINEA DE TIEMPO (SOLO EL DUEÑO)
  private eventosService = inject(EventosService);
  eventoPorAnular: Anulable | null = null;
  anulandoEvento = false;

  //NOMBRES DE LAS RAZAS Y LOTES DEL CELULAR (UN ANIMAL REGISTRADO SIN SEÑAL NO TRAE NOM_RAZA; UN LOTE RENOMBRADO SIN SEÑAL CAMBIA AQUI)
  private nombresRaza = new Map<number, string>();
  private nombresLote = new Map<string, string>();

  private uuid = '';
  private subscripciones: Subscription[] = [];
  private subsAnimal: Subscription[] = [];

  ngOnInit(): void {
    this.almacenLocal.razas()
      .then(razas => { razas.forEach(r => this.nombresRaza.set(Number(r.ID_RAZA), r.NOM_RAZA)); this.cd.detectChanges(); })
      .catch(() => { });
    this.almacenLocal.vacunas()
      .then(vacunas => { vacunas.forEach(v => this.nombresVacuna.set(Number(v.ID_VACUNA), v.NOM_VACUNA)); this.armarLinea(); this.cd.detectChanges(); })
      .catch(() => { });
    this.subscripciones.push(
      this.route.paramMap.subscribe(params => this.cargar(params.get('uuid') ?? '')),
      this.sincronizacion.estado$.subscribe(estado => {
        const volvio = !this.enLinea && estado.enLinea;
        this.enLinea = estado.enLinea;
        //SI VOLVIO LA SEÑAL Y LA FOTO NO SE HABIA PODIDO BAJAR, SE INTENTA OTRA VEZ
        if (volvio && this.animal?.FOTO_ANIMAL && !this.urlFoto) {
          this.archivoFotoMostrada = null;
          this.cargarFoto();
        }
        this.cd.detectChanges();
      }),
    );
    try {
      this.subscripciones.push(
        this.almacenLocal.observarLotes().subscribe({
          next: lotes => {
            this.nombresLote = new Map(lotes.map(l => [l.UUID_LOTE, l.NOM_LOTE]));
            this.armarLote();
            this.cd.detectChanges();
          },
        }),
        //TODOS LOS ANIMALES (TAMBIEN LOS QUE SALIERON): NOMBRES DE TOROS Y CRIAS EN LA LINEA DE TIEMPO
        this.almacenLocal.observarAnimales(false).subscribe({
          next: animales => {
            this.animalesFinca = new Map(animales.map(a => [a.UUID_ANIMAL, a]));
            this.armarLinea();
            this.cd.detectChanges();
          },
        }),
      );
    } catch { }
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
    this.subsAnimal.forEach(s => s.unsubscribe());
    this.ponerFoto(null);
  }

  private cargar(uuid: string): void {
    this.subsAnimal.forEach(s => s.unsubscribe());
    this.subsAnimal = [];
    this.uuid = uuid;
    this.cargando = true;
    this.noExiste = false;
    this.animal = null;
    this.vista = null;
    this.eventosAnimal = null;
    this.eventoPorAnular = null;
    this.crias = [];
    this.madre = null;
    this.padre = null;
    this.confirmarAnular = false;
    this.archivoFotoMostrada = null;
    this.ponerFoto(null);
    this.cd.detectChanges();
    try {
      this.subsAnimal.push(
        this.almacenLocal.observarAnimal(uuid).subscribe({
          next: animal => {
            //UN ANIMAL ANULADO YA NO TIENE FICHA
            this.animal = animal && animal.ESTADO_ANIMAL !== 'ANULADO' ? animal : null;
            this.vista = this.animal ? aVista(this.animal) : null;
            this.noExiste = !this.animal;
            this.cargando = false;
            this.armarLinea();
            this.armarLote();
            this.armarParientes();
            if ((this.animal?.FOTO_ANIMAL ?? null) !== this.archivoFotoMostrada) {
              this.cargarFoto();
            }
            this.cd.detectChanges();
          },
          error: () => { this.noExiste = true; this.cargando = false; this.cd.detectChanges(); },
        }),
        this.almacenLocal.observarEventosDeAnimal(uuid).subscribe({
          next: eventos => { this.eventosAnimal = eventos; this.armarLinea(); this.cd.detectChanges(); },
        }),
        this.almacenLocal.observarCrias(uuid).subscribe({
          next: crias => { this.crias = crias.map(aVista); this.cd.detectChanges(); },
        }),
      );
    } catch {
      this.noExiste = true;
      this.cargando = false;
    }
  }

  //---------------------------------------------FOTO--------------------------------------------------------------------------

  //CAMBIA LA URL DE LA FOTO REVOCANDO LA ANTERIOR (SI NO, EL BLOB QUEDA EN MEMORIA)
  private ponerFoto(foto: Blob | null): void {
    if (this.urlFoto) {
      URL.revokeObjectURL(this.urlFoto);
    }
    this.urlFoto = foto ? URL.createObjectURL(foto) : null;
  }

  private cargarFoto(): void {
    const animal = this.animal;
    const idFinca = this.fincaActual.actual?.idFinca;
    this.archivoFotoMostrada = animal?.FOTO_ANIMAL ?? null;
    if (!animal?.FOTO_ANIMAL || !idFinca) {
      this.ponerFoto(null);
      return;
    }
    const archivo = animal.FOTO_ANIMAL;
    const uuid = animal.UUID_ANIMAL;
    this.cargandoFoto = true;
    this.hatoService.obtenerFoto(idFinca, animal)
      .then(foto => {
        //SI MIENTRAS BAJABA CAMBIO EL ANIMAL O SU FOTO, ESTA YA NO SIRVE
        if (this.uuid === uuid && this.archivoFotoMostrada === archivo) {
          this.ponerFoto(foto);
        }
      })
      .catch(() => { })
      .finally(() => { this.cargandoFoto = false; this.cd.detectChanges(); });
  }

  //POR QUE TODAVIA NO SE PUEDE CAMBIAR LA FOTO ('' = SE PUEDE)
  //"NO HA LLEGADO AL SERVIDOR" = NO TIENE ID_ANIMAL (SOLO LO TRAE LA BAJADA). NO SE USA _pendiente: UNA EDICION SIN SUBIR
  //TAMBIEN LO PONE Y ESE ANIMAL SI EXISTE EN EL SERVIDOR
  get motivoSinFoto(): string {
    if (this.animal && !this.animal.ID_ANIMAL) {
      return 'Este animal todavía no ha llegado al servidor. Cuando se sincronice, ya puedes ponerle foto.';
    }
    if (!this.enLinea) {
      return 'La foto necesita señal. Cuando tengas señal, vuelve aquí y tómala.';
    }
    return '';
  }

  async alElegirFoto(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    const animal = this.animal;
    const idFinca = this.fincaActual.actual?.idFinca;
    if (!archivo || !animal || !idFinca || this.subiendoFoto) {
      return;
    }
    if (this.motivoSinFoto) {
      this.toast.warning(this.motivoSinFoto, 'Aviso', 5000, true, true, true);
      return;
    }
    this.subiendoFoto = true;
    this.cd.detectChanges();
    let foto: Blob;
    try {
      foto = await reducirImagen(archivo);
    } catch (e: any) {
      this.subiendoFoto = false;
      this.toast.danger(e?.message === 'Esa no es una foto válida' ? e.message : 'No se pudo preparar la foto. Prueba con otra.', 'Error', 5000, true, true, true);
      this.cd.detectChanges();
      return;
    }
    const uuid = animal.UUID_ANIMAL;
    this.hatoService.SubirFotoAnimal(idFinca, uuid, foto)
      .pipe(finalize(() => { this.subiendoFoto = false; this.cd.detectChanges(); }))
      .subscribe({
        next: async respuesta => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS?.FOTO_ANIMAL) {
            try {
              await this.hatoService.fotoSubida(uuid, respuesta.DATOS.FOTO_ANIMAL, foto);
            } catch { }
            this.toast.success(respuesta.MENSAJE || 'Listo: la foto quedó guardada.', 'Éxito', 5000, true, true, true);
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo subir la foto.', 'Error', 5000, true, true, true);
          }
          this.cd.detectChanges();
        },
        error: () => {
          this.toast.danger('No se pudo subir la foto. Revisa la señal e inténtalo otra vez.', 'Error', 5000, true, true, true);
          this.cd.detectChanges();
        },
      });
  }

  quitarFoto(): void {
    const animal = this.animal;
    const idFinca = this.fincaActual.actual?.idFinca;
    if (!animal || !idFinca || this.subiendoFoto) {
      return;
    }
    if (this.motivoSinFoto) {
      this.toast.warning(this.motivoSinFoto, 'Aviso', 5000, true, true, true);
      return;
    }
    const uuid = animal.UUID_ANIMAL;
    this.subiendoFoto = true;
    this.cd.detectChanges();
    this.hatoService.QuitarFotoAnimal(idFinca, uuid)
      .pipe(finalize(() => { this.subiendoFoto = false; this.cd.detectChanges(); }))
      .subscribe({
        next: async respuesta => {
          if (respuesta.CODIGO === 200) {
            try {
              await this.hatoService.fotoQuitada(uuid);
            } catch { }
            this.toast.success(respuesta.MENSAJE || 'Listo: la foto se quitó.', 'Éxito', 5000, true, true, true);
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo quitar la foto.', 'Error', 5000, true, true, true);
          }
          this.cd.detectChanges();
        },
        error: () => {
          this.toast.danger('No se pudo quitar la foto. Revisa la señal e inténtalo otra vez.', 'Error', 5000, true, true, true);
          this.cd.detectChanges();
        },
      });
  }

  //---------------------------------------------ANULAR------------------------------------------------------------------------

  async anular(): Promise<void> {
    if (!this.animal || this.anulando) {
      return;
    }
    const texto = this.textoAnimal;
    this.anulando = true;
    this.cd.detectChanges();
    try {
      await this.hatoService.anularAnimal(this.animal.UUID_ANIMAL);
      this.confirmarAnular = false;
      this.toast.success(`Listo: ${texto} quedó anulado. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
      this.router.navigate(['/app/hato']);
    } catch (e: any) {
      this.confirmarAnular = false;
      this.toast.danger(e?.message || 'No se pudo anular en el celular. Inténtalo otra vez.', 'Error', 7000, true, true, true);
    } finally {
      this.anulando = false;
      this.cd.detectChanges();
    }
  }

  //---------------------------------------------ANULAR UN EVENTO (DUEÑO)------------------------------------------------------

  pedirAnularEvento(anulable: Anulable): void {
    this.eventoPorAnular = anulable;
    this.cd.detectChanges();
  }

  get avisoAnularEvento(): string {
    const tipo = this.eventoPorAnular?.tipo;
    if (tipo === 'SALIDA') {
      return 'Al anular la salida, el animal vuelve al hato como si no hubiera salido.';
    }
    if (tipo === 'PARTO') {
      return 'Al anular el parto también se anula la cría que nació de él. Si la cría ya tiene registros propios, primero hay que anularlos.';
    }
    return 'Sale de la línea de tiempo y de las cuentas. Se sube cuando haya señal.';
  }

  async anularEventoConfirmado(): Promise<void> {
    const anulable = this.eventoPorAnular;
    if (!anulable || this.anulandoEvento) {
      return;
    }
    this.anulandoEvento = true;
    this.cd.detectChanges();
    try {
      await this.eventosService.anularEvento(anulable.tipo, anulable.uuid);
      this.toast.success(`Listo: se anuló ${anulable.descripcion}. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
    } catch (e: any) {
      this.toast.danger(e?.message || 'No se pudo anular en el celular. Inténtalo otra vez.', 'Error', 7000, true, true, true);
    } finally {
      this.eventoPorAnular = null;
      this.anulandoEvento = false;
      this.cd.detectChanges();
    }
  }

  get textoAnimal(): string {
    const v = this.vista;
    if (!v) {
      return 'el animal';
    }
    return v.chapeta ? `la chapeta ${v.chapeta}` : (v.nombre ?? 'el animal');
  }

  //---------------------------------------------DATOS PARA MOSTRAR------------------------------------------------------------

  private armarLote(): void {
    const a = this.animal;
    this.nombreLote = a?.UUID_LOTE ? (this.nombresLote.get(a.UUID_LOTE) ?? a.NOM_LOTE ?? null) : null;
  }

  //MADRE Y PADRE: SI ESTAN EN EL CELULAR SE PUEDE IR A SU FICHA; SI NO, SOLO LA CHAPETA QUE TRAJO LA BASE
  private armarParientes(): void {
    const a = this.animal;
    if (!a) {
      this.madre = null;
      this.padre = null;
      return;
    }
    const uuid = this.uuid;
    const buscar = async (uuidPariente: string | null, chapeta: string | null | undefined): Promise<Pariente | null> => {
      if (!uuidPariente) {
        return null;
      }
      const local = await this.almacenLocal.animalPorUuid(uuidPariente);
      if (local && local.ESTADO_ANIMAL !== 'ANULADO') {
        const v = aVista(local);
        return { uuid: local.UUID_ANIMAL, texto: [v.chapeta, v.nombre].filter(Boolean).join(' · ') || 'Sin chapeta' };
      }
      return { uuid: null, texto: chapeta || 'No está en este celular' };
    };
    Promise.all([buscar(a.UUID_MADRE, a.CHAPETA_MADRE), buscar(a.UUID_PADRE, a.CHAPETA_PADRE)])
      .then(([madre, padre]) => {
        if (this.uuid !== uuid) {
          return;
        }
        this.madre = madre;
        this.padre = padre ?? (a.PADRE_EXTERNO ? { uuid: null, texto: `${a.PADRE_EXTERNO} (de afuera)` } : null);
        this.cd.detectChanges();
      })
      .catch(() => { });
  }

  //NOMBRE CORTO DE UN ANIMAL DEL CELULAR: "23 · Lucero", "Lucero" O "sin chapeta"
  private nombreCorto(uuid: string | null): string | null {
    const a = uuid ? this.animalesFinca.get(uuid) : null;
    if (!a) {
      return null;
    }
    return [a.CHAPETA_ANIMAL, a.NOM_ANIMAL].filter(Boolean).join(' · ') || 'sin chapeta';
  }

  private numero(valor: number | string | null | undefined): number | null {
    if (valor === null || valor === undefined || valor === '') {
      return null;
    }
    const n = Number(valor);
    return isNaN(n) ? null : n;
  }

  //LA LINEA DE TIEMPO CON TODO LO DEL CELULAR: PESAJES, VACUNAS, SERVICIOS, PALPACIONES, PARTOS, ORDEÑOS (POR DIA) Y SALIDA
  private armarLinea(): void {
    const a = this.animal;
    if (!a) {
      this.eventos = [];
      return;
    }
    const ev = this.eventosAnimal;
    const eventos: EventoVista[] = [];
    const uno = (tipo: TipoEvento, uuid: string, descripcion: string): Anulable[] => [{ tipo, uuid, texto: 'Anular', descripcion }];
    const hoy = hoyLocal();

    //PESAJES
    for (const p of ev?.pesajes ?? []) {
      const peso = this.numero(p.PESO_KG);
      const cinta = p.ESTIMADO_CINTA === 'SI';
      eventos.push({
        clave: p.UUID_PESAJE, fecha: p.FECHA_EVENTO, fechaTexto: fechaLegible(p.FECHA_EVENTO, true),
        icono: 'pesa',
        titulo: peso !== null ? `Pesó ${peso} kg` : 'Pesaje',
        detalle: [cinta ? `Con cinta: ${p.PERIMETRO_CM} cm de pecho (peso estimado)` : 'Con báscula', p.OBSERVACION_PESAJE].filter(Boolean).join(' · '),
        cinta, pendiente: !!p._pendiente,
        anulables: uno('PESAJE', p.UUID_PESAJE, `el pesaje del ${fechaLegible(p.FECHA_EVENTO)}`),
      });
    }

    //VACUNAS Y TRATAMIENTOS (CON EL RETIRO DE LECHE SI SIGUE VIGENTE)
    for (const v of ev?.vacunaciones ?? []) {
      const nombre = this.nombresVacuna.get(Number(v.ID_VACUNA)) ?? 'Vacuna o tratamiento';
      const retiro = v.FECHA_FIN_RETIRO && v.FECHA_FIN_RETIRO.slice(0, 10) >= hoy ? v.FECHA_FIN_RETIRO : null;
      eventos.push({
        clave: v.UUID_VACUNACION, fecha: v.FECHA_EVENTO, fechaTexto: fechaLegible(v.FECHA_EVENTO, true),
        icono: 'jeringa',
        titulo: nombre,
        detalle: [v.DOSIS_VACUNACION ? `Dosis: ${v.DOSIS_VACUNACION}` : null,
          v.FECHA_PROXIMA_DOSIS ? `Próxima dosis: ${fechaLegible(v.FECHA_PROXIMA_DOSIS)}` : null, v.OBSERVACION_VACUNACION].filter(Boolean).join(' · ') || null,
        cinta: false, pendiente: !!v._pendiente,
        aviso: retiro ? `Sin vender leche hasta el ${fechaLegible(retiro)}` : null,
        anulables: uno('VACUNACION', v.UUID_VACUNACION, `${nombre} del ${fechaLegible(v.FECHA_EVENTO)}`),
      });
    }

    //MONTAS E INSEMINACIONES (CON EL TORO O LA PAJILLA Y EL PARTO PROBABLE)
    for (const s of ev?.servicios ?? []) {
      const monta = s.TIPO_SERVICIO === 'MONTA';
      const toro = s.UUID_TORO ? (this.nombreCorto(s.UUID_TORO) ?? 'de la finca') : null;
      const quien = toro ? `Con el toro ${toro}` : s.TORO_EXTERNO ? (monta ? `Toro de afuera: ${s.TORO_EXTERNO}` : `Pajilla: ${s.TORO_EXTERNO}`) : 'Sin saber el toro';
      eventos.push({
        clave: s.UUID_SERVICIO, fecha: s.FECHA_EVENTO, fechaTexto: fechaLegible(s.FECHA_EVENTO, true),
        icono: 'corazon',
        titulo: monta ? 'Monta' : 'Inseminación',
        detalle: [quien, `Parto probable: ${fechaLegible(sumarDias(s.FECHA_EVENTO, DIAS_GESTACION))}`, s.OBSERVACION_SERVICIO].filter(Boolean).join(' · '),
        cinta: false, pendiente: !!s._pendiente,
        anulables: uno('SERVICIO', s.UUID_SERVICIO, `${monta ? 'la monta' : 'la inseminación'} del ${fechaLegible(s.FECHA_EVENTO)}`),
      });
    }

    //PALPACIONES
    for (const p of ev?.palpaciones ?? []) {
      const preniada = p.RESULTADO_PALPACION === 'PRENIADA';
      const meses = this.numero(p.MESES_GESTACION);
      eventos.push({
        clave: p.UUID_PALPACION, fecha: p.FECHA_EVENTO, fechaTexto: fechaLegible(p.FECHA_EVENTO, true),
        icono: 'vaca',
        titulo: preniada ? `Palpada: preñada${meses ? ` de ${meses} ${meses === 1 ? 'mes' : 'meses'}` : ''}` : 'Palpada: vacía',
        detalle: [preniada && meses ? `Pariría más o menos el ${fechaLegible(sumarMeses(p.FECHA_EVENTO, 9 - meses))}` : null, p.OBSERVACION_PALPACION].filter(Boolean).join(' · ') || null,
        cinta: false, pendiente: !!p._pendiente,
        anulables: uno('PALPACION', p.UUID_PALPACION, `la palpación del ${fechaLegible(p.FECHA_EVENTO)}`),
      });
    }

    //PARTOS (CON SU CRIA TOCABLE)
    for (const p of ev?.partos ?? []) {
      const como = ({ NORMAL: 'Parto normal', ASISTIDO: 'Parto asistido', CESAREA: 'Por cesárea', ABORTO: null } as Record<string, string | null>)[p.TIPO_PARTO];
      const cria = p.UUID_CRIA ? this.animalesFinca.get(p.UUID_CRIA) : null;
      const titulo = p.TIPO_PARTO === 'ABORTO' ? 'Abortó' : p.CRIA_VIVA === 'SI' ? `Parió ${p.SEXO_CRIA === 'M' ? 'un ternero' : 'una ternera'}` : 'Parió: la cría nació muerta';
      eventos.push({
        clave: p.UUID_PARTO, fecha: p.FECHA_EVENTO, fechaTexto: fechaLegible(p.FECHA_EVENTO, true),
        icono: 'biberon',
        titulo,
        detalle: [como, p.OBSERVACION_PARTO].filter(Boolean).join(' · ') || null,
        cinta: false, pendiente: !!p._pendiente,
        enlace: cria && cria.ESTADO_ANIMAL !== 'ANULADO'
          ? { uuid: cria.UUID_ANIMAL, texto: `Ver ${p.SEXO_CRIA === 'M' ? 'el ternero' : 'la ternera'} ${this.nombreCorto(cria.UUID_ANIMAL) ?? ''}`.trim() }
          : null,
        anulables: uno('PARTO', p.UUID_PARTO, `el parto del ${fechaLegible(p.FECHA_EVENTO)}`),
      });
    }

    //ORDEÑOS AGRUPADOS POR DIA: MAÑANA + TARDE = TOTAL
    const porDia = new Map<string, OrdenoDTO[]>();
    for (const o of ev?.ordenos ?? []) {
      const dia = o.FECHA_EVENTO.slice(0, 10);
      porDia.set(dia, [...(porDia.get(dia) ?? []), o]);
    }
    const jornada = (j: string) => (j === 'MANANA' ? 'mañana' : 'tarde');
    for (const [dia, lista] of porDia) {
      const orden = [...lista].sort((x, y) => (x.JORNADA_ORDENO === 'MANANA' ? 0 : 1) - (y.JORNADA_ORDENO === 'MANANA' ? 0 : 1));
      const total = Math.round(orden.reduce((t, o) => t + (this.numero(o.LITROS_ORDENO) ?? 0), 0) * 10) / 10;
      eventos.push({
        clave: 'ordeno-' + dia,
        fecha: orden.map(o => o.FECHA_EVENTO).sort().pop() ?? dia,
        fechaTexto: fechaLegible(dia),
        icono: 'gota',
        titulo: `Ordeño: ${total} litros`,
        detalle: orden.map(o => `${o.JORNADA_ORDENO === 'MANANA' ? 'Mañana' : 'Tarde'} ${this.numero(o.LITROS_ORDENO) ?? 0} L`).join(' + ') + (orden.length > 1 ? ` = ${total} L` : ''),
        cinta: false, pendiente: orden.some(o => !!o._pendiente),
        anulables: orden.map(o => ({
          tipo: 'ORDENO' as TipoEvento, uuid: o.UUID_ORDENO,
          texto: orden.length > 1 ? `Anular la ${jornada(o.JORNADA_ORDENO)}` : 'Anular',
          descripcion: `el ordeño de la ${jornada(o.JORNADA_ORDENO)} del ${fechaLegible(dia)}`,
        })),
      });
    }

    //SALIDA
    for (const sa of ev?.salidas ?? []) {
      const valor = this.numero(sa.VALOR_SALIDA);
      const peso = this.numero(sa.PESO_SALIDA_KG);
      eventos.push({
        clave: sa.UUID_SALIDA, fecha: sa.FECHA_EVENTO, fechaTexto: fechaLegible(sa.FECHA_EVENTO, true),
        icono: 'salida',
        titulo: sa.TIPO_SALIDA === 'VENTA' ? 'Se vendió' : sa.TIPO_SALIDA === 'MUERTE' ? 'Murió' : 'Se trasladó a otra finca',
        detalle: [valor !== null ? `Por $${valor.toLocaleString('es-CO')}` : null, peso !== null ? `Pesaba ${peso} kg` : null,
          sa.CAUSA_SALIDA ? `Causa: ${sa.CAUSA_SALIDA}` : null, sa.OBSERVACION_SALIDA].filter(Boolean).join(' · ') || null,
        cinta: false, pendiente: !!sa._pendiente,
        anulables: uno('SALIDA', sa.UUID_SALIDA, `la salida del ${fechaLegible(sa.FECHA_EVENTO)}`),
      });
    }

    //ABAJO DE TODO: EL NACIMIENTO O LA LLEGADA
    const comprado = a.ORIGEN_ANIMAL === 'COMPRADO';
    const fechaIngreso = comprado ? a.FECHA_INGRESO_ANIMAL : a.FECHA_NACIMIENTO;
    eventos.push({
      clave: 'ingreso',
      fecha: (fechaIngreso ?? '').slice(0, 10),
      fechaTexto: fechaLegible(fechaIngreso) + (!comprado && a.FECHA_NACIMIENTO_ESTIMADA === 'SI' ? ' (aproximada)' : ''),
      icono: comprado ? 'finca' : 'biberon',
      titulo: comprado ? 'Llegó a la finca (comprado)' : 'Nació en la finca',
      detalle: comprado ? `Había nacido el ${fechaLegible(a.FECHA_NACIMIENTO)}${a.FECHA_NACIMIENTO_ESTIMADA === 'SI' ? ' (aproximado)' : ''}` : null,
      cinta: false,
      pendiente: !!a._pendiente,
    });
    //LO MAS NUEVO ARRIBA; EL INGRESO SIEMPRE AL FINAL
    this.eventos = eventos.sort((x, y) => (x.clave === 'ingreso' ? 1 : y.clave === 'ingreso' ? -1 : y.fecha.localeCompare(x.fecha)));
  }

  //---------------------------------------------REGISTRAR DESDE LA FICHA-------------------------------------------------------

  //HEMBRA QUE NO ES TERNERA: SE PUEDE ORDEÑAR, SERVIR, PALPAR Y REGISTRAR SU PARTO
  get hembraAdulta(): boolean {
    return !!this.animal && this.animal.SEXO_ANIMAL === 'H' && categoriaAnimal(this.animal) !== 'TERNERA';
  }

  get botonesRegistrar(): { texto: string; icono: string; ruta: string }[] {
    const lista = [{ texto: 'Pesar', icono: 'pesa', ruta: '/app/pesar' }];
    if (this.hembraAdulta) {
      lista.push(
        { texto: 'Ordeñar', icono: 'gota', ruta: '/app/evento/ordeno' },
        { texto: 'Monta / Inseminación', icono: 'corazon', ruta: '/app/evento/servicio' },
        { texto: 'Palpar', icono: 'buscar', ruta: '/app/evento/palpacion' },
        { texto: 'Parió', icono: 'biberon', ruta: '/app/evento/parto' },
      );
    }
    lista.push({ texto: 'Vacunar', icono: 'jeringa', ruta: '/app/evento/vacunacion' }, { texto: 'Salió', icono: 'salida', ruta: '/app/evento/salida' });
    return lista;
  }

  //SI YA SALIO DE LA FINCA: "Se vendió el 4 nov 2026"
  get textoSalida(): string | null {
    const a = this.animal;
    if (!a || a.ESTADO_ANIMAL === 'ACTIVO' || a.ESTADO_ANIMAL === 'ANULADO') {
      return null;
    }
    const como = a.ESTADO_ANIMAL === 'VENDIDO' ? 'Se vendió' : a.ESTADO_ANIMAL === 'MUERTO' ? 'Murió' : 'Se trasladó a otra finca';
    return a.FECHA_SALIDA_ANIMAL ? `${como} el ${fechaLegible(a.FECHA_SALIDA_ANIMAL)}` : como;
  }

  get edad(): string {
    return this.animal ? edadLegible(this.animal.FECHA_NACIMIENTO, this.animal.FECHA_NACIMIENTO_ESTIMADA === 'SI') : '';
  }

  get sexo(): string {
    return this.animal ? nombreSexo(this.animal.SEXO_ANIMAL) : '';
  }

  get estado(): string {
    return this.animal ? nombreEstado(this.animal.ESTADO_ANIMAL) : '';
  }

  get nacimiento(): string {
    return this.animal ? fechaLegible(this.animal.FECHA_NACIMIENTO) + (this.animal.FECHA_NACIMIENTO_ESTIMADA === 'SI' ? ' (aproximada)' : '') : '';
  }

  get origen(): string {
    if (!this.animal) {
      return '';
    }
    return this.animal.ORIGEN_ANIMAL === 'COMPRADO' ? `Comprado, llegó el ${fechaLegible(this.animal.FECHA_INGRESO_ANIMAL)}` : 'Nació en la finca';
  }

  get raza(): string {
    if (!this.animal) {
      return '';
    }
    return this.animal.NOM_RAZA || (this.animal.ID_RAZA !== null ? this.nombresRaza.get(Number(this.animal.ID_RAZA)) : null) || 'Sin raza';
  }

  get activo(): boolean {
    return this.animal?.ESTADO_ANIMAL === 'ACTIVO';
  }

  //"ES MADRE DE" (HEMBRA) O "ES PADRE DE" (MACHO)
  get tituloCrias(): string {
    return this.animal?.SEXO_ANIMAL === 'M' ? 'Sus crías (es el padre)' : 'Sus crías';
  }
}
