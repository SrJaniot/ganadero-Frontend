//LONGITUD MINIMA DE LA CONTRASEÑA (LA MISMA DE ms-seguridad)
export const LONGITUD_MINIMA_CLAVE = 8;

//GENERA UNA CONTRASEÑA ALEATORIA FACIL DE DICTAR (SIN 0/O NI 1/l/I PARA NO CONFUNDIRSE) CON EL GENERADOR SEGURO DEL NAVEGADOR
export function generarClave(longitud = 12): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const valores = new Uint32Array(longitud);
  crypto.getRandomValues(valores);
  return Array.from(valores, v => letras[v % letras.length]).join('');
}
