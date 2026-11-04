import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FincaActual } from '../Modelos/GanaderoModel';
import { AlmacenLocalService } from './almacen-local';

//LA FINCA EN LA QUE SE ESTA TRABAJANDO (localStorage 'fincaActual'). AL ELEGIRLA SE ABRE SU BASE LOCAL
//EL ROL DE LA FINCA (DUENIO / VAQUERO / VETERINARIO) DECIDE QUE BOTONES SE VEN; LA SEGURIDAD REAL LA HACEN EL BACKEND Y LA BASE
@Injectable({
  providedIn: 'root'
})
export class FincaActualService {
  private readonly clave = 'fincaActual';
  readonly finca$ = new BehaviorSubject<FincaActual | null>(this.leer());

  constructor(private almacenLocal: AlmacenLocalService) {
    const finca = this.finca$.value;
    if (finca) {
      this.almacenLocal.abrir(finca.idFinca);
    }
  }

  private leer(): FincaActual | null {
    try {
      const texto = localStorage.getItem(this.clave);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  }

  get actual(): FincaActual | null {
    return this.finca$.value;
  }

  get esDuenio(): boolean {
    return this.finca$.value?.rol === 'DUENIO';
  }

  elegir(finca: FincaActual): void {
    localStorage.setItem(this.clave, JSON.stringify(finca));
    this.almacenLocal.abrir(finca.idFinca);
    this.finca$.next(finca);
  }

  //CUANDO LA BAJADA TRAE OTRO ROL O NOMBRE (EL DUEÑO LO CAMBIO)
  actualizar(cambios: Partial<FincaActual>): void {
    const finca = this.finca$.value;
    if (!finca) {
      return;
    }
    this.elegir({ ...finca, ...cambios });
  }

  olvidar(): void {
    localStorage.removeItem(this.clave);
    this.finca$.next(null);
  }
}
