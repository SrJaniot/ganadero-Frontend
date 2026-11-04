import { PermisoModel } from "./Permiso.model";
import { UsuarioLogin } from "./UsuarioLogin.model";

export class UsuarioValidadoModel {
  usuario?: UsuarioLogin;
  token?: string ="";
  menu: PermisoModel[]=[]
}
