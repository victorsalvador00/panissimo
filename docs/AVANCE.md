# Avance de SGO Paníssimo

> Bitácora de trabajo para retomar entre sesiones. Última actualización: 2026-10-16 (B-01).
> Reglas: `docs/specs/dominio.md`; tareas: `docs/specs/backend.md` §13 y `docs/specs/frontend.md` §11.

## Backend

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | B-01 Solución, Program.cs, Serilog, ProblemDetails, JSON, health, OpenAPI + Scalar, Docker, compose dev, CLAUDE.md | ✅ | (ver `git log`) |
| 1 | B-02 AppDbContext, interceptores, folios, candados, semilla base. `InitialCreate` | ⏳ | |
| 1 | B-03 Identity, login, refresh rotativo, permisos, alcance, rate limit | ⏳ | |
| 1 | B-04 Usuarios, roles, bitácora, ubicaciones, settings | ⏳ | |
| 1 | B-05 Catálogos y CSV de artículos | ⏳ | |
| 1 | B-06 Motor de inventario | ⏳ | |
| 1 | B-07 Existencias, kardex, alertas, ajustes, existencias iniciales | ⏳ | |
| 1 | B-08 Conteo físico y consumo | ⏳ | |
| 1 | B-09 Traspasos directos | ⏳ | |
| 2 | B-10..B-13 Recetas, OP, cierres, importación de Excel | ⏳ | |
| 3 | B-14..B-16 Proveedores, requisiciones, OC y recepciones | ⏳ | |
| 4 | B-17..B-21 Pedidos de sucursal, clientes, remisiones, plan, requerimiento | ⏳ | |
| 5 | B-22..B-25 Tablero, costos y análisis, fotos, endurecimiento | ⏳ | |

## Frontend

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | F-01..F-08 | ⏳ | |
| 2 | F-09..F-12 | ⏳ | |
| 3 | F-13..F-15 | ⏳ | |
| 4 | F-16..F-20 | ⏳ | |
| 5 | F-21..F-24 | ⏳ | |

## Notas por tarea

### B-01 (2026-10-16)

- Solución `backend/Panissimo.sln`: `Panissimo.Domain`, `Panissimo.Application`, `Panissimo.Infrastructure`, `Panissimo.Api`, `tests/Panissimo.UnitTests`, `tests/Panissimo.IntegrationTests`. `TreatWarningsAsErrors` en `Directory.Build.props`.
- API: prefijo `/api/v1` por convención, JSON con enums como texto y números estrictos (mismas opciones en MVC y OpenAPI), `ProblemDetails` en español (`ProblemDetailsMapper`, `GlobalExceptionHandler`, errores de *model binding* con claves `camelCase`), filtro global de FluentValidation, Serilog (JSON compacto fuera de Development), `/health/live` y `/health/ready` (consulta `SELECT 1`), OpenAPI + Scalar en Development.
- Excepciones de dominio en `Panissimo.Domain/Common/DomainExceptions.cs` (422, 404, 409, 401, 400, 403, `insufficient_stock` con `shortages`).
- Docker: `backend/Dockerfile` (targets `runtime` y `migrator` con bundle por `TARGETARCH`); `deploy/docker-compose.dev.yml` (postgres 16, api con `dotnet watch` en el puerto 8090, respaldos diarios en `deploy/backups`).
- `deploy/seed/locations.csv` vacío (solo encabezados) hasta confirmar D-01.
- Pruebas: 10 unitarias (mapeo de errores, claves camelCase) y 4 de integración (health, 404 en ProblemDetails, OpenAPI).
- Paquetes (licencia): FluentValidation 12.1.1 (Apache-2.0), Microsoft.AspNetCore.OpenApi 10.0.12 (MIT), Scalar.AspNetCore 2.17.8 (MIT), Serilog.AspNetCore 10.0.0 y Serilog.Formatting.Compact 3.0.0 (Apache-2.0), Npgsql 10.0.3 y Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3 (PostgreSQL), Microsoft.EntityFrameworkCore 10.0.12 (MIT), EFCore.NamingConventions 10.0.1 (Apache-2.0), xunit 2.9.3 (Apache-2.0), NSubstitute 6.2.0 (BSD), Testcontainers.PostgreSql 4.15.0 (MIT), Microsoft.AspNetCore.Mvc.Testing 10.0.12 (MIT).

## Pendientes y decisiones abiertas

- D-01..D-10 (dominio §8) siguen como **propuesta**. B-02 usa D-01 (PLANTA + CSV de sucursales); B-04 depende de D-10 (no bloquea: solo semilla y capacitación).
