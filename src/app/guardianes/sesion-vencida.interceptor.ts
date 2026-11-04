import { Injectable, Injector } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { SeguridadService } from '../servicios/seguridad';

/**
 * CIERRA LA SESION SOLA CUANDO EL BACKEND YA NO ACEPTA EL TOKEN (VENCIDO, CERRADO O INVALIDO)
 * NO AGREGA ENCABEZADOS (EL BEARER LO SIGUE PONIENDO CADA SERVICIO CON getHeaders): SOLO MIRA LAS RESPUESTAS 401
 * DE LAS PETICIONES QUE LLEVABAN TOKEN Y LE PIDE A SeguridadService QUE CONFIRME CON ms-seguridad
 */
@Injectable()
export class SesionVencidaInterceptor implements HttpInterceptor {

  //SE OBTIENE EL SERVICIO CON EL INJECTOR PARA NO CREAR UN CICLO (SeguridadService USA HttpClient)
  constructor(private injector: Injector) { }

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      tap({
        error: (err) => {
          if (err instanceof HttpErrorResponse && err.status === 401 && req.headers.has('Authorization')) {
            this.injector.get(SeguridadService).VerificarTokenEnServidor();
          }
        }
      })
    );
  }
}
