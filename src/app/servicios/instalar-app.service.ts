import { Injectable, signal } from '@angular/core';

//EVENTO QUE CHROME / ANDROID ENVIA CUANDO LA PAGINA SE PUEDE INSTALAR COMO APP
interface EventoInstalarApp extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// INSTALAR MONSTERHOUSE COMO APP EN EL CELULAR (PWA), COPIADO DE MONCHIS
// ANDROID / CHROME: SE GUARDA EL EVENTO beforeinstallprompt Y SE MUESTRA EL BOTON "INSTALAR"
// IPHONE: NO HAY BOTON; SE EXPLICA COMO HACERLO (COMPARTIR -> AGREGAR A INICIO)
@Injectable({
  providedIn: 'root'
})
export class InstalarAppService {
  private evento: EventoInstalarApp | null = null;
  //SIGNAL PARA QUE LA PANTALLA SE ACTUALICE SOLA CUANDO EL NAVEGADOR AVISA (LA APP NO USA zone.js)
  private readonly disponible = signal(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (evento: Event) => {
      evento.preventDefault();
      this.evento = evento as EventoInstalarApp;
      this.disponible.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.evento = null;
      this.disponible.set(false);
    });
  }

  //YA ESTA ABIERTA COMO APP (NO HAY QUE OFRECER INSTALARLA)
  get abiertaComoApp(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  }

  get puedeInstalar(): boolean {
    return this.disponible() && !this.abiertaComoApp;
  }

  get esIphone(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !this.abiertaComoApp;
  }

  //ABRE EL DIALOGO DEL NAVEGADOR. DEVUELVE true SI LA INSTALO
  async instalar(): Promise<boolean> {
    if (!this.evento) {
      return false;
    }
    await this.evento.prompt();
    const eleccion = await this.evento.userChoice;
    this.evento = null;
    this.disponible.set(false);
    return eleccion.outcome === 'accepted';
  }
}
