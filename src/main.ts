import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';

platformBrowser().bootstrapModule(AppModule, {

})
  .catch(err => console.error(err));

//APP INSTALABLE (PWA): EL SERVICE WORKER ESTA EN public/sw.js (SOLO FUNCIONA CON https O EN localhost)
//SOLO GUARDA EL CASCARON DE LA APP PARA QUE ABRA SIN SEÑAL; LOS DATOS DE LA FINCA VIVEN EN INDEXEDDB (DEXIE), NUNCA EN EL CACHE
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => console.error('No se pudo registrar el service worker'));
  });
}
