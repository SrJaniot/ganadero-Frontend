import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { finalize } from 'rxjs';
import { FincaActual, MiFincaDTO, NOMBRE_ROL_FINCA, RespuestaServerCrearFinca, RespuestaServerObtenerMisFincas, RolFinca } from '../../../Modelos/GanaderoModel';
import { FincaActualService } from '../../../servicios/finca-actual.service';
import { FincasService } from '../../../servicios/fincas.service';
import { SeguridadService } from '../../../servicios/seguridad';

//VIEWMODEL DE UNA FINCA EN LA LISTA
interface FincaVM {
  idFinca: number;
  nombre: string;
  municipio: string;
  vereda: string | null;
  rol: RolFinca;
  nombreRol: string;
  animalesActivos: number;
}

function mapearFinca(dto: MiFincaDTO): FincaVM {
  return {
    idFinca: Number(dto.ID_FINCA),
    nombre: dto.NOM_FINCA,
    municipio: dto.MUNICIPIO_FINCA,
    vereda: dto.VEREDA_FINCA,
    rol: dto.ROL_FINCA,
    nombreRol: NOMBRE_ROL_FINCA[dto.ROL_FINCA] ?? dto.ROL_FINCA,
    animalesActivos: Number(dto.ANIMALES_ACTIVOS ?? 0),
  };
}

//ELEGIR LA FINCA (SI TRABAJA EN VARIAS) O CREAR LA PRIMERA (EL DUEÑO RECIEN REGISTRADO). NECESITA SEÑAL
//SIN SEÑAL Y CON UNA FINCA YA ELEGIDA, SE PUEDE SEGUIR CON ESA (LO DEL CELULAR ESTA AHI)
@Component({
  selector: 'app-elegir-finca',
  standalone: false,
  templateUrl: './elegir-finca.component.html',
})
export class ElegirFincaComponent implements OnInit {

  fincas: FincaVM[] = [];
  cargando = false;
  errorCarga = false;
  sinSenal = false;
  sinFincas = false;
  guardando = false;
  //EL DUEÑO QUE YA TIENE FINCAS TAMBIEN PUEDE CREAR OTRA
  mostrarFormulario = false;

  fincaForm = new FormGroup({
    nom_finca: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    municipio_finca: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    vereda_finca: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    registro_ica_finca: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    hierro_finca: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
  });

  constructor(
    private fincasService: FincasService,
    private fincaActual: FincaActualService,
    private seguridadService: SeguridadService,
    private toast: NgToastService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargarFincas();
  }

  get actual(): FincaActual | null {
    return this.fincaActual.actual;
  }

  get nombreUsuario(): string {
    return this.seguridadService.ObtenerDatosUsuarioIdentificadoSESION()?.usuario?.nombre ?? '';
  }

  get puedeCrearFinca(): boolean {
    return this.seguridadService.esDuenio();
  }

  cargarFincas() {
    this.errorCarga = false;
    this.sinSenal = false;
    if (!navigator.onLine) {
      this.sinSenal = true;
      this.cd.detectChanges();
      return;
    }
    this.cargando = true;
    this.fincasService.ObtenerMisFincas()
      .pipe(finalize(() => { this.cargando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerObtenerMisFincas) => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            this.fincas = respuesta.DATOS.map(mapearFinca);
            this.sinFincas = this.fincas.length === 0;
            //UNA SOLA FINCA Y NINGUNA ELEGIDA: ENTRA DIRECTO
            if (this.fincas.length === 1 && !this.fincaActual.actual) {
              this.elegir(this.fincas[0]);
            }
          } else if (respuesta.CODIGO === 404) {
            this.fincas = [];
            this.sinFincas = true;
          } else {
            this.errorCarga = true;
            this.toast.danger(respuesta.MENSAJE || 'No se pudieron traer tus fincas', 'Error', 5000, true, true, true);
          }
        },
        error: (err) => {
          if (err?.status === 0) {
            this.sinSenal = true;
          } else {
            this.errorCarga = true;
            this.toast.danger('No se pudieron traer tus fincas', 'Error', 5000, true, true, true);
          }
        }
      });
  }

  elegir(finca: FincaVM) {
    this.fincaActual.elegir({ idFinca: finca.idFinca, nombre: finca.nombre, rol: finca.rol });
    this.router.navigate(['/app/hoy']);
  }

  seguirConLaActual() {
    this.router.navigate(['/app/hoy']);
  }

  abrirFormulario() {
    this.fincaForm.reset();
    this.mostrarFormulario = true;
    this.cd.detectChanges();
  }

  cancelarFormulario() {
    this.mostrarFormulario = false;
    this.cd.detectChanges();
  }

  campoInvalido(campo: keyof typeof this.fincaForm.controls): boolean {
    const control = this.fincaForm.controls[campo];
    return control.touched && control.invalid;
  }

  private textoOpcional(valor: string): string | null {
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
  }

  crearFinca() {
    if (this.fincaForm.invalid) {
      this.fincaForm.markAllAsTouched();
      return;
    }
    if (!navigator.onLine) {
      this.toast.warning('Para crear la finca se necesita señal', 'Sin señal', 5000, true, true, true);
      return;
    }
    const datos = this.fincaForm.getRawValue();
    const nombre = datos.nom_finca.trim();
    this.guardando = true;
    this.fincasService.CrearFinca({
      nom_finca: nombre,
      municipio_finca: datos.municipio_finca.trim(),
      vereda_finca: this.textoOpcional(datos.vereda_finca),
      registro_ica_finca: this.textoOpcional(datos.registro_ica_finca),
      hierro_finca: this.textoOpcional(datos.hierro_finca),
    })
      .pipe(finalize(() => { this.guardando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (respuesta: RespuestaServerCrearFinca) => {
          if (respuesta.CODIGO === 200 && respuesta.DATOS) {
            this.toast.success(respuesta.MENSAJE || 'La finca quedó creada', 'Éxito', 5000, true, true, true);
            this.fincaActual.elegir({ idFinca: Number(respuesta.DATOS.ID_FINCA), nombre, rol: 'DUENIO' });
            this.router.navigate(['/app/hoy']);
          } else {
            this.toast.danger(respuesta.MENSAJE || 'No se pudo crear la finca', 'Error', 5000, true, true, true);
          }
        },
        error: () => {
          this.toast.danger('No hay conexión con el servidor. Intenta de nuevo', 'Error', 5000, true, true, true);
        }
      });
  }
}
