import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';
import { NgToastService } from 'ng-angular-popup';
import { AnimalDTO, PesajeDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { HatoService, reducirImagen } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { SincronizacionService } from '../../../../servicios/sincronizacion.service';
import { AnimalVista, aVista, edadLegible, fechaLegible, nombreEstado, nombreSexo } from './hato-vista';

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
  pesajes: PesajeDTO[] = [];
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
    this.pesajes = [];
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
        this.almacenLocal.observarPesajesDeAnimal(uuid).subscribe({
          next: pesajes => { this.pesajes = pesajes; this.armarLinea(); this.cd.detectChanges(); },
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

  private armarLinea(): void {
    const a = this.animal;
    if (!a) {
      this.eventos = [];
      return;
    }
    const eventos: EventoVista[] = this.pesajes.map(p => {
      const peso = p.PESO_KG === null || p.PESO_KG === '' ? null : Number(p.PESO_KG);
      const cinta = p.ESTIMADO_CINTA === 'SI';
      return {
        clave: p.UUID_PESAJE,
        fecha: p.FECHA_EVENTO,
        fechaTexto: fechaLegible(p.FECHA_EVENTO, true),
        icono: cinta ? 'cinta' : 'pesa',
        titulo: peso !== null && !isNaN(peso) ? `Pesó ${peso} kg` : 'Pesaje',
        detalle: [cinta ? `Con cinta: ${p.PERIMETRO_CM} cm de pecho (peso estimado)` : 'Con báscula', p.OBSERVACION_PESAJE].filter(Boolean).join(' · '),
        cinta,
        pendiente: !!p._pendiente,
      };
    });
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
    //LO MAS NUEVO ARRIBA; EL INGRESO, SI COINCIDE EN EL DIA, ABAJO DE TODO
    this.eventos = eventos.sort((x, y) => y.fecha.localeCompare(x.fecha) || (x.clave === 'ingreso' ? 1 : y.clave === 'ingreso' ? -1 : 0));
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
