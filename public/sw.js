// SERVICE WORKER DE GANADERO (APP INSTALABLE Y QUE ABRE SIN SEÑAL), COPIADO DEL PATRON DE MONCHIS Y MAS PRUDENTE
// SOLO GUARDA EL CASCARON DE LA APP (index.html, .js, .css, iconos, fuentes de la pagina y el manifest) PARA QUE ABRA AUNQUE LA RED FALLE
// NUNCA GUARDA DATOS DE LA FINCA: ESOS VIVEN EN INDEXEDDB (DEXIE). TODO LO DE /api/... VA SIEMPRE A LA RED Y NO SE TOCA,
// NI LO QUE LLEVE Authorization, NI LO DE OTROS DOMINIOS (EN DESARROLLO LOS BACKENDS ESTAN EN OTRO PUERTO)
// SIEMPRE PIDE PRIMERO A LA RED (ASI NUNCA SE QUEDA CON UNA VERSION VIEJA) Y USA LA COPIA SOLO SI NO HAY CONEXION
const CACHE = 'ganadero-v1';
const TIPOS_CASCARON = ['document', 'script', 'style', 'image', 'font', 'manifest'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function esCascaron(peticion) {
  const url = new URL(peticion.url);
  return peticion.method === 'GET'
    && url.origin === self.location.origin
    && !url.pathname.startsWith('/api/')
    && !url.pathname.includes('comprobante')
    && !peticion.headers.has('Authorization')
    && (peticion.mode === 'navigate' || TIPOS_CASCARON.includes(peticion.destination));
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (!esCascaron(peticion)) {
    return;
  }
  //LAS RUTAS DE ANGULAR (/app/hoy, /app/hato...) SON TODAS index.html: SE GUARDA UNA SOLA COPIA
  const llave = peticion.mode === 'navigate' ? '/index.html' : peticion;
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta.ok && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(llave, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(llave).then((guardada) => guardada || Response.error()))
  );
});
