import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AnimalDTO, PesajeDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { SeguridadService } from '../../../../servicios/seguridad';
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

//FICHA DEL ANIMAL: DATOS Y SU LINEA DE TIEMPO (SIN SEÑAL, CON LO DEL CELULAR)
//EN LA FASE 0 LA LINEA TIENE LA LLEGADA O EL NACIMIENTO Y LOS PESAJES
@Component({
  selector: 'app-ficha-animal',
  standalone: false,
  templateUrl: './ficha-animal.component.html',
})
export class FichaAnimalComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private almacenLocal = inject(AlmacenLocalService);
  private seguridadService = inject(SeguridadService);
  private cd = inject(ChangeDetectorRef);

  cargando = true;
  noExiste = false;
  animal: AnimalDTO | null = null;
  vista: AnimalVista | null = null;
  pesajes: PesajeDTO[] = [];
  eventos: EventoVista[] = [];
  puedePesar = this.seguridadService.tienePermiso(4, 'guardar');
  //NOMBRES DE LAS RAZAS DEL CELULAR (UN ANIMAL REGISTRADO SIN SEÑAL NO TRAE NOM_RAZA)
  private nombresRaza = new Map<number, string>();

  private uuid = '';
  private subscripciones: Subscription[] = [];
  private subsAnimal: Subscription[] = [];

  ngOnInit(): void {
    this.almacenLocal.razas()
      .then(razas => { razas.forEach(r => this.nombresRaza.set(Number(r.ID_RAZA), r.NOM_RAZA)); this.cd.detectChanges(); })
      .catch(() => { });
    this.subscripciones.push(
      this.route.paramMap.subscribe(params => this.cargar(params.get('uuid') ?? '')),
    );
  }

  ngOnDestroy(): void {
    this.subscripciones.forEach(s => s.unsubscribe());
    this.subsAnimal.forEach(s => s.unsubscribe());
  }

  private cargar(uuid: string): void {
    this.subsAnimal.forEach(s => s.unsubscribe());
    this.subsAnimal = [];
    this.uuid = uuid;
    this.cargando = true;
    this.noExiste = false;
    this.animal = null;
    this.pesajes = [];
    this.cd.detectChanges();
    try {
      //SE OBSERVA TODO EL HATO (TAMBIEN VENDIDOS O MUERTOS) PARA QUE LA FICHA SE ACTUALICE SOLA AL SINCRONIZAR
      this.subsAnimal.push(
        this.almacenLocal.observarAnimales(false).subscribe({
          next: lista => {
            this.animal = lista.find(a => a.UUID_ANIMAL === this.uuid) ?? null;
            this.vista = this.animal ? aVista(this.animal) : null;
            this.noExiste = !this.animal;
            this.cargando = false;
            this.armarLinea();
            this.cd.detectChanges();
          },
          error: () => { this.noExiste = true; this.cargando = false; this.cd.detectChanges(); },
        }),
        this.almacenLocal.observarPesajesDeAnimal(uuid).subscribe({
          next: pesajes => { this.pesajes = pesajes; this.armarLinea(); this.cd.detectChanges(); },
        }),
      );
    } catch {
      this.noExiste = true;
      this.cargando = false;
    }
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
}
