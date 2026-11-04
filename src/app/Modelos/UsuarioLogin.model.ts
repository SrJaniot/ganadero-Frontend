//DATOS PUBLICOS DEL USUARIO QUE DEVUELVE EL LOGIN (ms-seguridad). ENTRA CON EL CELULAR; EL CORREO ES OPCIONAL
export class UsuarioLogin {
  id_usuario?: string;
  nombre?: string;
  celular?: string;
  correo?: string | null;
  rolid?: number;
}
