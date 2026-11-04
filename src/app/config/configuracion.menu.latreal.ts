// CATALOGO DE MENUS: menuid (TABLA menu DE SEGURIDAD) -> RUTA, ICONO Y TEXTO DE LA BARRA DE ABAJO
// SE MUESTRAN LOS QUE EL ROL TIENE CON listar = true. EL ORDEN ES EL DE LA BARRA
// fase: EN QUE FASE DEL PLAN LLEGA LA PANTALLA (MIENTRAS TANTO SE MUESTRA "EN CONSTRUCCION")
// 1 USUARIOS, 5 HOY Y ALERTAS, 6 INDICADORES Y 7 CONFIGURACION LLEGAN EN FASES SIGUIENTES
export namespace ConfiguracionMenuLateral {
    export const listaMenus = [
      { menuid: 4, ruta: '/app/hoy', icono: 'casa', texto: 'Hoy', fase: 0 },
      { menuid: 3, ruta: '/app/hato', icono: 'vaca', texto: 'Hato', fase: 0 },
      { menuid: 8, ruta: '/app/sincronizacion', icono: 'nube', texto: 'Subir', fase: 0 },
      { menuid: 2, ruta: '/app/finca', icono: 'finca', texto: 'Mi finca', fase: 0 },
      { menuid: 9, ruta: '/app/perfil', icono: 'usuario', texto: 'Perfil', fase: 0 },
  ];
}
