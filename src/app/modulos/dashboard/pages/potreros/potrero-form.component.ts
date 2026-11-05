import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgToastService } from 'ng-angular-popup';
import { Subscription } from 'rxjs';
import { PotreroDTO } from '../../../../Modelos/GanaderoModel';
import { AlmacenLocalService } from '../../../../servicios/almacen-local';
import { FincaActualService } from '../../../../servicios/finca-actual.service';
import { areaHectareas, DatosPotrero, PotrerosService } from '../../../../servicios/potreros.service';
import { SeguridadService } from '../../../../servicios/seguridad';
import { ContornoVecino } from './mapa-potrero.component';

//POTRERO NUEVO O EDITAR (data.modo = 'editar', SOLO EL DUEÑO). EL NOMBRE BASTA; AREA, DESCANSO Y MAPA SON OPCIONALES
//LAS REGLAS SON LAS DE FUN_VALIDAR_POTRERO (LA BASE LAS VUELVE A REVISAR AL SUBIR)
@Component({
  selector: 'app-potrero-form',
  standalone: false,
  templateUrl: './potrero-form.component.html',
})
export class PotreroFormComponent implements OnInit, OnDestroy {
  private almacenLocal = inject(AlmacenLocalService);
  private potrerosService = inject(PotrerosService);
  private fincaActual = inject(FincaActualService);
  private seguridadService = inject(SeguridadService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(NgToastService);
  private cd = inject(ChangeDetectorRef);

  editar = this.route.snapshot.data['modo'] === 'editar';
  uuid = this.route.snapshot.paramMap.get('uuid');
  puede = this.editar ? this.fincaActual.esDuenio : this.seguridadService.tienePermiso(3, 'guardar');
  cargando = true;
  noExiste = false;
  guardando = false;
  verMapa = false;
  errores: { nombre?: string; area?: string; dias?: string; contorno?: string } = {};

  form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
    area: new FormControl('', { nonNullable: true }),
    dias: new FormControl('30', { nonNullable: true }),
  });
  contorno: [number, number][] = [];
  vecinos: ContornoVecino[] = [];
  private otros: PotreroDTO[] = [];
  private subscripcion: Subscription | null = null;

  ngOnInit(): void {
    this.subscripcion = this.almacenLocal.observarPotreros().subscribe(({ potreros }) => {
      if (!this.cargando) return;
      this.otros = potreros.filter(p => p.UUID_POTRERO !== this.uuid);
      this.vecinos = this.otros.filter(p => p.CONTORNO_POTRERO?.length).map(p => ({ nombre: p.NOM_POTRERO, contorno: p.CONTORNO_POTRERO! }));
      if (this.editar) {
        const p = potreros.find(x => x.UUID_POTRERO === this.uuid);
        if (!p) {
          this.noExiste = true;
        } else {
          this.form.setValue({ nombre: p.NOM_POTRERO, area: p.AREA_POTRERO === null ? '' : String(p.AREA_POTRERO).replace('.', ','), dias: String(p.DIAS_DESCANSO_POTRERO) });
          this.contorno = p.CONTORNO_POTRERO ?? [];
          this.verMapa = this.contorno.length > 0;
        }
      }
      this.cargando = false;
      this.cd.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.subscripcion?.unsubscribe();
  }

  //EL AREA QUE DA EL CONTORNO DIBUJADO (SOLO SE SUGIERE: LA PERSONA DECIDE SI LA USA)
  get areaDibujada(): number | null {
    return this.contorno.length >= 3 ? Math.round(areaHectareas(this.contorno) * 100) / 100 : null;
  }

  usarAreaDibujada(): void {
    if (this.areaDibujada) {
      this.form.controls.area.setValue(String(this.areaDibujada).replace('.', ','));
      this.errores.area = '';
      this.cd.detectChanges();
    }
  }

  alCambiarContorno(puntos: [number, number][]): void {
    this.contorno = puntos;
    this.errores.contorno = '';
    this.cd.detectChanges();
  }

  //MISMAS REGLAS QUE FUN_VALIDAR_POTRERO
  private validar(): DatosPotrero | null {
    this.errores = {};
    const nombre = this.form.controls.nombre.value.trim().replace(/\s+/g, ' ');
    const textoArea = this.form.controls.area.value.trim().replace(',', '.');
    const area = textoArea === '' ? null : Number(textoArea);
    const dias = Number(this.form.controls.dias.value);
    if (!nombre || nombre.length > 60) {
      this.errores.nombre = 'Escribe el nombre del potrero (máximo 60 caracteres)';
    } else if (this.otros.some(p => p.NOM_POTRERO.toLowerCase() === nombre.toLowerCase())) {
      this.errores.nombre = 'Ya hay un potrero con ese nombre';
    }
    if (area !== null && (!Number.isFinite(area) || area <= 0 || area > 10000)) {
      this.errores.area = 'El área debe estar entre 0,01 y 10.000 hectáreas';
    }
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      this.errores.dias = 'Los días de descanso deben estar entre 1 y 365';
    }
    if (this.contorno.length > 0 && this.contorno.length < 3) {
      this.errores.contorno = 'El contorno necesita al menos 3 puntos (o bórralo)';
    }
    if (Object.values(this.errores).some(Boolean)) return null;
    return {
      nom_potrero: nombre,
      area_potrero: area === null ? null : Math.round(area * 100) / 100,
      dias_descanso_potrero: dias,
      contorno_potrero: this.contorno.length >= 3 ? this.contorno : null,
    };
  }

  async guardar(): Promise<void> {
    if (this.guardando) return;
    const datos = this.validar();
    if (!datos) {
      this.cd.detectChanges();
      return;
    }
    this.guardando = true;
    this.cd.detectChanges();
    try {
      let uuid = this.uuid;
      if (this.editar && uuid) {
        await this.potrerosService.editarPotrero(uuid, datos);
      } else {
        uuid = await this.potrerosService.crearPotrero(datos);
      }
      this.toast.success(`Listo: el potrero «${datos.nom_potrero}» quedó guardado. Se sube cuando haya señal.`, 'Éxito', 5000, true, true, true);
      this.router.navigate(['/app/potreros', uuid]);
    } catch {
      this.toast.danger('No se pudo guardar en el celular. Inténtalo otra vez.', 'Error', 5000, true, true, true);
      this.guardando = false;
      this.cd.detectChanges();
    }
  }
}
