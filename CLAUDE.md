# SGO Paníssimo — Sistema de Gestión Operativa

Sistema web para Paníssimo (Grupo Maroño): una planta que compra, produce (OP con cierres parciales y final, plan e importación de Excel) y abastece a sus sucursales (granel) y a clientes terceros (empaquetado). Módulos: organización, catálogos, inventario, producción, logística, ventas a terceros, compras, seguridad y tablero. Un solo programador; sin licencias de software de pago.

Se construye **desde cero, fase por fase**. El SGO AR es la referencia funcional, pero **no se copia su código**.

## Documentos de referencia (leer antes de implementar)

- `docs/specs/dominio.md`: entidades, estados, reglas de negocio (RN-xx), permisos y decisiones abiertas (D-xx). **Fuente de verdad.**
- `docs/specs/backend.md`: arquitectura, API, persistencia, seguridad y tareas B-xx (§13).
- `docs/specs/frontend.md`: arquitectura, diseño visual, pantallas, componentes y tareas F-xx (§11).
- `docs/AVANCE.md`: bitácora por tarea. Actualizarla al cerrar cada tarea.

Cuando una tarea mencione una regla (ej. "RN-61"), abre la sección correspondiente y cúmplela literalmente. Si una regla es ambigua o depende de una decisión abierta sin confirmar, **pregunta antes de asumir**.

## Estructura del repositorio

```
/backend    .NET 10 — Panissimo.Domain, Panissimo.Application, Panissimo.Infrastructure, Panissimo.Api, tests/
/frontend   Angular 22 + Angular Material (desde F-01)
/deploy     docker-compose.dev.yml (local), docker-compose.yml (prod), Caddyfile, .env.example, seed/, backup/
/docs       specs/, AVANCE.md, rendimiento.md
```

## Comandos

```bash
# Infra local (copiar deploy/.env.example a deploy/.env y llenar los secretos)
docker compose -f deploy/docker-compose.dev.yml up -d            # postgres + api (dotnet watch, puerto 8090) + respaldos
docker compose -f deploy/docker-compose.dev.yml up -d postgres   # solo la BD

# Backend (desde /backend)
dotnet build
dotnet test                                   # integración usa Testcontainers: Docker debe estar corriendo
dotnet run --project src/Panissimo.Api        # http://localhost:8090, Scalar en /scalar
dotnet ef migrations add <Nombre> -p src/Panissimo.Infrastructure -s src/Panissimo.Api -o Persistence/Migrations
dotnet ef database update -p src/Panissimo.Infrastructure -s src/Panissimo.Api

# Frontend (desde /frontend, a partir de F-01)
npm start          # proxy a http://localhost:8090 (o PAN_API_URL)
npm test
npm run lint
npm run e2e
npm run api:types  # regenerar tipos desde el OpenAPI del backend en ejecución
```

## Convenciones

- **Idioma:** código, tablas, endpoints y commits en inglés. Textos de interfaz y mensajes de error al usuario en español (México).
- **Commits:** Conventional Commits, con la tarea al final (`feat(inventory): add FEFO lot allocator [B-06]`).
- **Configuración:** variables de entorno con prefijo `PAN__` (`PAN__ConnectionStrings__Default`, `PAN__Jwt__Key`…).
- **Backend:**
  - Un servicio de aplicación por agregado, sin mediador.
  - Mapeo manual con `ToDto()`.
  - Transiciones de estado dentro de la entidad; una inválida lanza `BusinessRuleException(code, mensaje)` → 422.
  - Errores como `ProblemDetails` con `type` `https://panissimo/errors/<codigo>`.
  - Cantidades en unidad base con `numeric(18,4)`; enteras si la unidad es `pza` (RN-03b).
- **Frontend:**
  - Standalone components con `OnPush` y signals.
  - Reactive Forms tipados.
  - Tipos de API generados, sin interfaces duplicadas a mano.
  - Una carpeta por feature con `data-access/`, `pages/` y `ui/`.

## Reglas estrictas

1. **Cero dependencias con licencia de pago.** Antes de agregar cualquier paquete NuGet o npm, verifica su licencia en la versión exacta y menciónala en el resumen de la tarea. Prohibidos: MediatR, AutoMapper, MassTransit v9+, FluentAssertions v8+, EPPlus v5+, QuestPDF, Duende IdentityServer, Telerik, DevExpress, Syncfusion, AG Grid Enterprise, Kendo, PrimeNG v22+ y `@primeuix/*`, PrimeFlex, Tailwind (salvo decisión explícita), SheetJS y ExcelJS. **Nunca** una referencia directa a `SixLabors.*` (ClosedXML la trae solo como transitiva).
2. **El inventario solo se mueve con `IInventoryPostingService`**, dentro de una transacción. Nunca se modifica `StockBalance` directamente.
3. **Migraciones:** nunca editar una migración existente; crear una nueva. No aplicar migraciones al arrancar en producción (bundle).
4. **Seguridad:**
   - Todo endpoint nuevo declara su permiso (`[RequirePermission]`) y valida el alcance de ubicación (`ILocationScope`).
   - El frontend oculta lo que no se permite, pero el backend es quien protege.
5. **Secretos:** nunca en el código ni en commits. Usar variables de entorno y mantener `deploy/.env.example` actualizado.
6. **Pruebas:**
   - Cada regla de negocio nueva lleva prueba unitaria.
   - Cada flujo que mueve inventario lleva prueba de integración.
   - No marques una tarea como terminada con pruebas en rojo.
7. **Alcance:** no implementes nada fuera de alcance (CFDI, cobranza, contabilidad, nómina, POS, offline, forecast, capacidad) aunque parezca útil. Si algo falta en el spec, pregunta.

## Flujo de trabajo por tarea

1. Leer la tarea (B-xx / F-xx), las secciones del spec que referencia y sus decisiones abiertas (dominio §8).
2. Proponer un plan breve (archivos a crear o modificar, migración, pruebas).
3. Implementar en pasos pequeños, compilando y probando seguido.
4. Cerrar con:
   - `dotnet test` o `npm test && npm run lint` en verde.
   - `docs/AVANCE.md` actualizado.
   - Un resumen de cambios, los paquetes nuevos con su licencia y los pendientes o dudas.

## Definición de terminado

- Cumple el criterio de aceptación de la tarea.
- Compila sin warnings (`TreatWarningsAsErrors`), con pruebas y lint en verde.
- La migración está creada (si aplica) y probada contra una BD limpia.
- Los endpoints nuevos aparecen documentados en OpenAPI con ejemplos de request.
- Los textos de interfaz están en español, sin textos en inglés visibles al usuario.
