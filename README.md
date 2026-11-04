# Frontend de Ganadero

App para el celular del ganadero de doble propósito: funciona **sin señal** (Dexie sobre IndexedDB) y sincroniza después con `ms-logica-ganadero`. Angular 21 con NgModules, Tailwind 4 y PWA (`public/sw.js`).

Documentación completa: `V:\proyectos\documentacion general\proyectos\ganadero\PLAN_GANADERO.md` (secciones 4, 5 y 9).

```
npm ci
npm start        # http://localhost:4200, usa ms-seguridad en 3020 y ms-logica en 3021
npm run build    # producción: las URLs pasan a /api/seguridad/ y /api/logica/
```

- `src/app/servicios/almacen-local.ts`: el único archivo que toca IndexedDB (copia de la finca y bandeja de salida).
- `src/app/servicios/sincronizacion.service.ts`: sube la bandeja y baja los cambios desde la marca del servidor.
