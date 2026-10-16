# SGO AR — Sistema de Gestión Operativa AR

Sistema web para una franquicia de cafeterías: 10 sucursales, fábrica y comisariato. Tiene módulos de inventario, producción, logística (pedidos y traspasos), compras y usuarios/permisos. Un solo programador; sin licencias de software de pago.

## Documentos de referencia (leer antes de implementar)

- `docs/specs/dominio.md`: entidades, estados, reglas de negocio (RN-xx) y permisos. **Fuente de verdad.**
- `docs/specs/backend.md`: arquitectura, API, persistencia, seguridad y tareas B-xx.
- `docs/specs/frontend.md`: arquitectura, pantallas, componentes y tareas F-xx.

Cuando una tarea mencione una regla (ej. "RN-12"), abre la sección correspondiente y cúmplela literalmente. Si una regla es ambigua o está en "Decisiones abiertas", **pregunta antes de asumir**.

## Estructura del repositorio

```
/backend    .NET 10 — Sgo.Domain, Sgo.Application, Sgo.Infrastructure, Sgo.Api, tests/
/frontend   Angular + Angular Material
/deploy     docker-compose.yml (prod), docker-compose.dev.yml (local), Caddyfile, .env.example
/docs/specs Especificaciones
```

## Comandos

```bash
# Infra local
docker compose -f deploy/docker-compose.dev.yml up -d postgres

# Backend (desde /backend)
dotnet build
dotnet test
dotnet run --project src/Sgo.Api
dotnet ef migrations add <Nombre> -p src/Sgo.Infrastructure -s src/Sgo.Api -o Persistence/Migrations
dotnet ef database update -p src/Sgo.Infrastructure -s src/Sgo.Api

# Frontend (desde /frontend)
npm start          # con proxy a http://localhost:8090 (o a SGO_API_URL si está definida)
npm test
npm run lint
npm run e2e
npm run api:types  # regenerar tipos desde el OpenAPI del backend en ejecución
npm run lighthouse # accesibilidad (≥ 90) de login, tablero y recepción; requiere API y frontend en marcha
npm run icons      # regenerar el subconjunto de Material Symbols tras usar un ícono nuevo (pip install fonttools brotli)
npm run help:record # regrabar los videos del manual de usuario (public/help/*.webm); requiere API y frontend en marcha
```

## Convenciones

- **Idioma:** código, tablas, endpoints y commits en inglés. Textos de interfaz y mensajes de error al usuario en español (México).
- **Commits:** Conventional Commits, con la tarea al final (`feat(inventory): add FEFO lot allocator [B-06]`).
- **Backend:**
  - Un servicio de aplicación por agregado.
  - Mapeo manual con `ToDto()`.
  - Transiciones de estado dentro de la entidad.
  - Errores como `ProblemDetails`.
  - Cantidades en unidad base con `numeric(18,4)`.
- **Frontend:**
  - Standalone components con `OnPush` y signals.
  - Reactive Forms tipados.
  - Tipos de API generados, sin interfaces duplicadas a mano.
  - Una carpeta por feature con `data-access/`, `pages/` y `ui/`.

## Reglas estrictas

1. **Cero dependencias con licencia de pago.** Antes de agregar cualquier paquete NuGet o npm, verifica su licencia en la versión exacta y menciónala en el resumen de la tarea. Prohibidos: MediatR, AutoMapper, MassTransit v9+, FluentAssertions v8+, EPPlus v5+, QuestPDF, Duende IdentityServer, Telerik, DevExpress, Syncfusion, AG Grid Enterprise, Kendo, PrimeNG v22+ y `@primeuix/*` con licencia "PrimeUI" (dejaron de ser MIT), PrimeNG Blocks o plantillas premium.
2. **El inventario solo se mueve con `IInventoryPostingService`**, dentro de una transacción. Nunca se modifica `StockBalance` directamente.
3. **Migraciones:** nunca editar una migración existente; crear una nueva. No aplicar migraciones automáticamente al arrancar en producción.
4. **Seguridad:**
   - Todo endpoint nuevo declara su permiso (`[RequirePermission]`) y valida el alcance de ubicación (`ILocationScope`).
   - El frontend oculta lo que no se permite, pero el backend es quien protege.
5. **Secretos:** nunca en el código ni en commits. Usar variables de entorno y mantener `.env.example` actualizado.
6. **Pruebas:**
   - Cada regla de negocio nueva lleva prueba unitaria.
   - Cada flujo que mueve inventario lleva prueba de integración.
   - No marques una tarea como terminada con pruebas en rojo.
7. **Alcance:** no implementes nada fuera de alcance (CFDI, contabilidad, POS, offline) aunque parezca útil. Si algo falta en el spec, pregunta.

## Flujo de trabajo por tarea

1. Leer la tarea (B-xx / F-xx) y las secciones del spec que referencia.
2. Proponer un plan breve (archivos a crear o modificar, migración, pruebas) y esperar confirmación.
3. Implementar en pasos pequeños, compilando y probando seguido.
4. Cerrar con:
   - `dotnet test` o `npm test && npm run lint` en verde.
   - Un resumen de cambios.
   - Los paquetes nuevos con su licencia.
   - Los pendientes o dudas.

## Definición de terminado

- Cumple el criterio de aceptación de la tarea.
- Compila sin warnings nuevos, con pruebas y lint en verde.
- La migración está creada (si aplica) y probada contra una BD limpia.
- Los endpoints nuevos aparecen documentados en OpenAPI con ejemplos de request.
- Los textos de interfaz están en español, sin textos en inglés visibles al usuario.
