//EN DESARROLLO (ng serve EN 4200, O 4300 EN LAS PRUEBAS) SE USAN LOS BACKENDS DEL PC; EN EL SERVIDOR, APACHE PASA /api/... A LOS BACKENDS
//(MISMO DOMINIO, SIN CORS NI PUERTOS ABIERTOS)
const enDesarrollo = typeof window !== 'undefined' && ['4200', '4300'].includes(window.location.port);

export namespace ConfiguracionRutasBackend {
  export const url_backend_ms_seguridad = enDesarrollo ? "http://127.0.0.1:3020/" : "/api/seguridad/";
  export const url_backend_ms_negocio = enDesarrollo ? "http://127.0.0.1:3021/" : "/api/logica/";
}
