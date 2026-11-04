import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NgToastService } from 'ng-angular-popup';
import { finalize } from 'rxjs';
import { generarClave, LONGITUD_MINIMA_CLAVE } from '../../../../compartido/clave';
import {
  NOMBRE_ROL_FINCA, PersonaFincaDTO, RespuestaServerCrearPersonaFinca, RespuestaServerObtenerFinca,
  RespuestaServerObtenerPersonasFinca, RolFinca
} from '../../../../Modelos/GanaderoModel';
import { RespuestaServerSinDATA } from '../../../../Modelos/RespuestaServerSinDATA.model';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { FincasService } from '../../../../servicios/fincas.service';
import { SeguridadService } from '../../../../servicios/seguridad';

//VIEWMODEL DE UNA PERSONA DE LA FINCA
interface PersonaVM {
  idFincaPersona: number;
  idUsuario: string;
  nombre: string;
  rol: RolFinca;
  nombreRol: string;
  activa: boolean;
}

function mapearPersona(dto: PersonaFincaDTO): PersonaVM {
  return {
    idFincaPersona: Number(dto.ID_FINCA_PERSONA),
    idUsuario: dto.ID_USUARIO,
    nombre: dto.NOM_PERSONA,
    rol: dto.ROL_FINCA,
    nombreRol: NOMBRE_ROL_FINCA[dto.ROL_FINCA] ?? dto.ROL_FINCA,
    activa: dto.ESTADO_FINCA_PERSONA === 'ACTIVO',
  };
}

//LO QUE SE MUESTRA DESPUES DE AGREGAR A ALGUIEN
interface ResultadoAgregar {
  nombre: string;
  celular: string;
  cuentaNueva: boolean;
  clave: string;
}

const PATRON_CELULAR = /^[\d\s+-]{10,16}$/;

//MI FINCA (DUEÑO): DATOS DE LA FINCA Y SUS PERSONAS (AGREGAR VAQUERO O VETERINARIO, RESTABLECER CLAVE, CAMBIAR ROL, QUITAR O DEVOLVER)
//TODO NECESITA SEÑAL: NO PASA POR LA BANDEJA
@Component({
  selector: 'app-mi-finca',
  standalone: false,
  templateUrl: './mi-finca.component.html',
})
export class MiFincaComponent implements OnInit {

  readonly roles: { valor: RolFinca; texto: string; ayuda: string }[] = [
    { valor: 'VAQUERO', texto: 'Vaquero', ayuda: 'Registra ordeños, pesajes y lo que pasa en el potrero' },
    { valor: 'VETERINARIO', texto: 'Veterinario', ayuda: 'Registra vacunas, tratamientos y palpaciones' },
    { valor: 'DUENIO', texto: 'Dueño', ayuda: 'Puede todo, también agregar y quitar personas' },
  ];
  readonly longitudMinimaClave = LONGITUD_MINIMA_CLAVE;

  sinSenal = false;
  cargandoFinca = false;
  errorCargaFinca = false;
  guardandoFinca = false;
  cargandoPersonas = false;
  errorCargaPersonas = false;
  personas: PersonaVM[] = [];

  fincaForm = new FormGroup({
    nom_finca: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    municipio_finca: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    vereda_finca: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    registro_ica_finca: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    hierro_finca: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
  });

  //AGREGAR PERSONA
  agregarAbierto = false;
  guardandoPersona = false;
  resultadoAgregar: ResultadoAgregar | null = null;
  personaForm = new FormGroup({
    nom_persona: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    celular: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(PATRON_CELULAR)] }),
    rol_finca: new FormControl<RolFinca>('VAQUERO', { nonNullable: true, validators: [Validators.required] }),
    clave: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(LONGITUD_MINIMA_CLAVE)] }),
  });

  //RESTABLECER CLAVE
  personaClave: PersonaVM | null = null;
  claveNueva = '';
  claveRestablecida = false;
  guardandoClave = false;

  //CAMBIAR ROL
  personaRol: PersonaVM | null = null;
  rolElegido: RolFinca = 'VAQUERO';
  guardandoRol = false;

  //QUITAR O DEVOLVER
  personaEstado: PersonaVM | null = null;
  guardandoEstado = false;

  constructor(
    private fincasService: FincasService,
    private fincaActual: FincaActualService,
    private seguridadService: SeguridadService,
    private toast: NgToastService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.esDuenio) {
      return;
    }
    this.cargarTodo();
  }

  get esDuenio(): boolean {
    return this.fincaActual.esDuenio;
  }

  get idFinca(): number {
    return this.fincaActual.actual?.idFinca ?? 0;
  }

  get miId(): string {
    return this.seguridadService.ObtenerDatosUsuarioIdentificadoSESION()?.usuario?.id_usuario ?? '';
  }

  get personasActivas(): PersonaVM[] {
    return this.personas.filter(p => p.activa);
  }

  get personasInactivas(): PersonaVM[] {
    return this.personas.filter(p => !p.activa);
  }

  //SIN SEÑAL NO SE LLAMA AL SERVIDOR
  private haySenal(): boolean {
    if (navigator.onLine) {
      return true;
    }
    this.toast.warning('Para esto se necesita señal', 'Sin señal', 5000, true, true, true);
    return false;
  }

  cargarTodo() {
    this.sinSenal = !navigator.onLine;
    if (this.sinSenal) {
      this.cd.detectChanges();
      return;
    }
    this.cargarFinca();
    this.cargarPersonas();
  }

  //----------------------------------------DATOS DE LA FINCA----------------------------------------
  cargarFinca() {
    this.cargandoFinca = true;
    this.errorCargaFinca = false;
    this.fincasService.ObtenerFincaID(this.idFinca)
      .pipe(finalize(() => { this.cargandoFinca = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerObtenerFinca) => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            const f = respuesta.DATOS;
            this.fincaForm.reset({
              nom_finca: f.NOM_FINCA ?? '',
              municipio_finca: f.MUNICIPIO_FINCA ?? '',
              vereda_finca: f.VEREDA_FINCA ?? '',
              registro_ica_finca: f.REGISTRO_ICA_FINCA ?? '',
              hierro_finca: f.HIERRO_FINCA ?? '',
            });
          } else {
            this.errorCargaFinca = true;
            this.toast.danger(respuesta.MENSAJE || 'No se pudieron traer los datos de la finca', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.errorCargaFinca = true;
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  campoFincaInvalido(campo: keyof typeof this.fincaForm.controls): boolean {
    const control = this.fincaForm.controls[campo];
    return control.touched && control.invalid;
  }

  private textoOpcional(valor: string): string | null {
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
  }

  guardarFinca() {
    if (this.fincaForm.invalid) {
      this.fincaForm.markAllAsTouched();
      return;
    }
    if (!this.haySenal()) {
      return;
    }
    const datos = this.fincaForm.getRawValue();
    const nombre = datos.nom_finca.trim();
    this.guardandoFinca = true;
    this.fincasService.ActualizarFinca({
      id_finca: this.idFinca,
      nom_finca: nombre,
      municipio_finca: datos.municipio_finca.trim(),
      vereda_finca: this.textoOpcional(datos.vereda_finca),
      registro_ica_finca: this.textoOpcional(datos.registro_ica_finca),
      hierro_finca: this.textoOpcional(datos.hierro_finca),
    })
      .pipe(finalize(() => { this.guardandoFinca = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerSinDATA) => {
          if (respuesta.CODIGO === 200) {
            this.toast.success(respuesta.MENSAJE || 'Los datos de la finca quedaron guardados', 'Éxito', 5000, true, true, true);
            this.fincaActual.actualizar({ nombre });
            this.fincaForm.markAsPristine();
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudieron guardar los datos', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  //----------------------------------------PERSONAS----------------------------------------
  cargarPersonas() {
    this.cargandoPersonas = true;
    this.errorCargaPersonas = false;
    this.fincasService.ObtenerPersonasFinca(this.idFinca)
      .pipe(finalize(() => { this.cargandoPersonas = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerObtenerPersonasFinca) => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            this.personas = respuesta.DATOS.map(mapearPersona);
          } else if (respuesta.CODIGO === 404) {
            this.personas = [];
          } else {
            this.errorCargaPersonas = true;
            this.toast.danger(respuesta.MENSAJE || 'No se pudieron traer las personas', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.errorCargaPersonas = true;
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  esYo(persona: PersonaVM): boolean {
    return persona.idUsuario === this.miId;
  }

  iniciales(nombre: string): string {
    return nombre.trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
  }

  //AGREGAR
  abrirAgregar() {
    if (!this.haySenal()) {
      return;
    }
    this.personaForm.reset({ nom_persona: '', celular: '', rol_finca: 'VAQUERO', clave: generarClave() });
    this.resultadoAgregar = null;
    this.agregarAbierto = true;
    this.cd.detectChanges();
  }

  otraClaveAgregar() {
    this.personaForm.controls.clave.setValue(generarClave());
  }

  cerrarAgregar() {
    if (this.guardandoPersona) {
      return;
    }
    this.agregarAbierto = false;
    this.resultadoAgregar = null;
    this.cd.detectChanges();
  }

  campoPersonaInvalido(campo: keyof typeof this.personaForm.controls): boolean {
    const control = this.personaForm.controls[campo];
    return control.touched && control.invalid;
  }

  guardarPersona() {
    if (this.personaForm.invalid) {
      this.personaForm.markAllAsTouched();
      return;
    }
    if (!this.haySenal()) {
      return;
    }
    const datos = this.personaForm.getRawValue();
    this.guardandoPersona = true;
    this.fincasService.CrearPersonaFinca({
      id_finca: this.idFinca,
      nom_persona: datos.nom_persona.trim(),
      celular: datos.celular.trim(),
      clave: datos.clave,
      rol_finca: datos.rol_finca,
    })
      .pipe(finalize(() => { this.guardandoPersona = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerCrearPersonaFinca) => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            this.toast.success(respuesta.MENSAJE || 'La persona quedó agregada a la finca', 'Éxito', 5000, true, true, true);
            this.resultadoAgregar = {
              nombre: datos.nom_persona.trim(),
              celular: datos.celular.trim(),
              cuentaNueva: respuesta.DATOS.CUENTA_NUEVA === true,
              clave: datos.clave,
            };
            this.cargarPersonas();
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo agregar a la persona', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  //RESTABLECER CLAVE
  abrirClave(persona: PersonaVM) {
    if (!this.haySenal()) {
      return;
    }
    this.personaClave = persona;
    this.claveNueva = generarClave();
    this.claveRestablecida = false;
    this.cd.detectChanges();
  }

  otraClave() {
    this.claveNueva = generarClave();
  }

  cerrarClave() {
    if (this.guardandoClave) {
      return;
    }
    this.personaClave = null;
    this.claveRestablecida = false;
    this.cd.detectChanges();
  }

  guardarClave() {
    if (!this.personaClave || !this.haySenal()) {
      return;
    }
    this.guardandoClave = true;
    this.fincasService.RestablecerClavePersonaFinca({ id_finca: this.idFinca, id_usuario: this.personaClave.idUsuario, clave: this.claveNueva })
      .pipe(finalize(() => { this.guardandoClave = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerSinDATA) => {
          if (respuesta.CODIGO === 200) {
            this.toast.success(respuesta.MENSAJE || 'La clave quedó cambiada', 'Éxito', 5000, true, true, true);
            this.claveRestablecida = true;
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo cambiar la clave', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  //CAMBIAR ROL
  abrirRol(persona: PersonaVM) {
    if (!this.haySenal()) {
      return;
    }
    this.personaRol = persona;
    this.rolElegido = persona.rol;
    this.cd.detectChanges();
  }

  cerrarRol() {
    if (this.guardandoRol) {
      return;
    }
    this.personaRol = null;
    this.cd.detectChanges();
  }

  guardarRol() {
    const persona = this.personaRol;
    if (!persona || !this.haySenal()) {
      return;
    }
    if (this.rolElegido === persona.rol) {
      this.cerrarRol();
      return;
    }
    this.guardandoRol = true;
    this.fincasService.ActualizarPersonaFinca({
      id_finca_persona: persona.idFincaPersona,
      rol_finca: this.rolElegido,
      estado_finca_persona: persona.activa ? 'ACTIVO' : 'INACTIVO',
    })
      .pipe(finalize(() => { this.guardandoRol = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerSinDATA) => {
          if (respuesta.CODIGO === 200) {
            this.toast.success(respuesta.MENSAJE || 'El rol quedó cambiado', 'Éxito', 5000, true, true, true);
            this.personaRol = null;
            this.cargarPersonas();
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo cambiar el rol', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }

  //QUITAR O DEVOLVER
  abrirEstado(persona: PersonaVM) {
    if (!this.haySenal()) {
      return;
    }
    this.personaEstado = persona;
    this.cd.detectChanges();
  }

  cerrarEstado() {
    if (this.guardandoEstado) {
      return;
    }
    this.personaEstado = null;
    this.cd.detectChanges();
  }

  get tituloEstado(): string {
    const p = this.personaEstado;
    if (!p) {
      return '';
    }
    return p.activa ? `¿Quitar a ${p.nombre} de la finca?` : `¿Devolver a ${p.nombre} a la finca?`;
  }

  get descripcionEstado(): string {
    const p = this.personaEstado;
    if (!p) {
      return '';
    }
    return p.activa
      ? 'Ya no podrá ver ni registrar nada de esta finca. Lo que ya registró se queda. Si trabaja en otra finca, allá sigue entrando.'
      : `Vuelve a entrar a la finca como ${p.nombreRol.toLowerCase()}, con la misma clave de siempre.`;
  }

  guardarEstado() {
    const persona = this.personaEstado;
    if (!persona || !this.haySenal()) {
      return;
    }
    this.guardandoEstado = true;
    this.fincasService.ActualizarPersonaFinca({
      id_finca_persona: persona.idFincaPersona,
      rol_finca: persona.rol,
      estado_finca_persona: persona.activa ? 'INACTIVO' : 'ACTIVO',
    })
      .pipe(finalize(() => { this.guardandoEstado = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerSinDATA) => {
          if (respuesta.CODIGO === 200) {
            this.toast.success(respuesta.MENSAJE || (persona.activa ? 'La persona salió de la finca' : 'La persona volvió a la finca'), 'Éxito', 5000, true, true, true);
            this.personaEstado = null;
            this.cargarPersonas();
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo hacer el cambio', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor', 'Error', 5000, true, true, true);
        }
      });
  }
}
