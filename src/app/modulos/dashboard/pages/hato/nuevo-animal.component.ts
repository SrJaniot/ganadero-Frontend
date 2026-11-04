import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { RazaDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { DatosAnimalNuevo, HatoService, hoyLocal } from '../../../../servicios/hato.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { fechaLegible, fechaLocalDe } from './hato-vista';

const PATRON_CHAPETA = /^[A-Za-z0-9-]{1,20}$/;

type CampoError = 'chapeta' | 'nombre' | 'sexo' | 'nacimiento' | 'edad' | 'llegada';

//ANIMAL NUEVO (COMPRADO O NACIDO SIN PARTO REGISTRADO): SE GUARDA EN EL CELULAR Y VA A LA BANDEJA
//LAS REGLAS SON LAS DE FUN_VALIDAR_ANIMALES (LA BASE LAS VUELVE A REVISAR AL SUBIR)
@Component({
  selector: 'app-nuevo-animal',
  standalone: false,
  templateUrl: './nuevo-animal.component.html',
})
export class NuevoAnimalComponent implements OnInit {
  private almacenLocal = inject(AlmacenLocalService);
  private hatoService = inject(HatoService);
  private seguridadService = inject(SeguridadService);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  puedeCrearAnimal = this.seguridadService.tienePermiso(3, 'guardar');
  guardando = false;
  razas: RazaDTO[] = [];
  errores: Partial<Record<CampoError, string>> = {};
  hoy = hoyLocal();
  hace25 = fechaLocalDe(new Date(new Date().getFullYear() - 25, new Date().getMonth(), new Date().getDate()));

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
  });

  ngOnInit(): void {
    this.cargarRazas();
  }

  private cargarRazas(): void {
    this.almacenLocal.razas()
      .then(razas => { this.razas = razas; this.cd.detectChanges(); })
      .catch(() => { this.razas = []; this.cd.detectChanges(); });
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
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - meses);
    return fechaLocalDe(d);
  }

  get fechaNacimientoLegible(): string {
    return fechaLegible(this.fechaNacimientoCalculada);
  }

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
    this.guardando = true;
    this.cd.detectChanges();
    try {
      //CHAPETA NO REPETIDA EN EL CELULAR (LA BASE TAMBIEN LO REVISA EN TODA LA FINCA)
      if (chapeta && await this.almacenLocal.animalPorChapeta(chapeta)) {
        this.errores = { chapeta: `La chapeta ${chapeta} ya la tiene otro animal de la finca` };
        return;
      }
      const datos: DatosAnimalNuevo = {
        chapeta_animal: chapeta,
        nom_animal: v.nombre.trim() || null,
        sexo_animal: v.sexo as 'H' | 'M',
        fecha_nacimiento: this.fechaNacimientoCalculada!,
        fecha_nacimiento_estimada: v.sabeFecha ? 'NO' : 'SI',
        id_raza: v.idRaza ? Number(v.idRaza) : null,
        uuid_lote: null,
        uuid_madre: null,
        uuid_padre: null,
        padre_externo: null,
        origen_animal: v.origen,
        fecha_ingreso_animal: v.origen === 'COMPRADO' ? v.fechaIngreso : null,
      };
      const uuid = await this.hatoService.crearAnimal(datos);
      const texto = chapeta ? `chapeta ${chapeta}` : (datos.nom_animal ?? 'el animal');
      this.guardado = { uuid, texto };
      this.toast.success(`Listo: ${texto} quedó en el hato. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
    } finally {
      this.guardando = false;
      this.cd.detectChanges();
    }
  }

  pesarAhora(): void {
    if (this.guardado) {
      this.router.navigate(['/app/pesar'], { queryParams: { animal: this.guardado.uuid } });
    }
  }

  otroAnimal(): void {
    this.guardado = null;
    this.errores = {};
    this.form.reset();
    this.cd.detectChanges();
  }
}
