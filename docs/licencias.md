# Revisión de licencias (B-25)

Revisión del 2026-10-18 sobre las versiones exactas instaladas, leyendo la licencia que declara cada paquete: el `.nuspec` en la caché de NuGet y el `package.json` en `node_modules`. Regla del proyecto (CLAUDE.md): **cero dependencias con licencia de pago**. Resultado: **se cumple**. No hay paquetes prohibidos ni licencias comerciales.

## Backend (NuGet)

128 paquetes en total, contando los transitivos:

| Licencia | Paquetes |
|---|---:|
| MIT | 102 |
| Apache-2.0 | 21 |
| PostgreSQL | 2 |
| MS-PL o Apache-2.0 (a elección) | 1 |
| BSD-3-Clause | 1 |
| xunit.abstractions: enlace a la licencia de xUnit (Apache-2.0) | 1 |

Referencias directas de la aplicación:

| Paquete | Versión | Licencia |
|---|---|---|
| ClosedXML | 0.105.1 | MIT |
| CsvHelper | 33.1.0 | MS-PL OR Apache-2.0 |
| EFCore.NamingConventions | 10.0.1 | Apache-2.0 |
| FluentValidation | 12.1.1 | Apache-2.0 |
| FluentValidation.DependencyInjectionExtensions | 12.1.1 | Apache-2.0 |
| Microsoft.AspNetCore.Authentication.JwtBearer | 10.0.12 | MIT |
| Microsoft.AspNetCore.Identity.EntityFrameworkCore | 10.0.12 | MIT |
| Microsoft.AspNetCore.OpenApi | 10.0.12 | MIT |
| Microsoft.EntityFrameworkCore | 10.0.12 | MIT |
| Microsoft.EntityFrameworkCore.Design | 10.0.12 | MIT |
| Npgsql | 10.0.3 | PostgreSQL |
| Npgsql.EntityFrameworkCore.PostgreSQL | 10.0.3 | PostgreSQL |
| Scalar.AspNetCore | 2.17.8 | MIT |
| Serilog.AspNetCore | 10.0.0 | Apache-2.0 |
| Serilog.Formatting.Compact | 3.0.0 | Apache-2.0 |

Referencias directas de las pruebas:

| Paquete | Versión | Licencia |
|---|---|---|
| Microsoft.AspNetCore.Mvc.Testing | 10.0.12 | MIT |
| Microsoft.NET.Test.Sdk | 17.14.1 | MIT |
| NSubstitute | 6.2.0 | BSD-3-Clause |
| Testcontainers.PostgreSql | 4.15.0 | MIT |
| coverlet.collector | 6.0.4 | MIT |
| xunit | 2.9.3 | Apache-2.0 |
| xunit.runner.visualstudio | 3.1.4 | Apache-2.0 |

**SixLabors:** `SixLabors.Fonts` **1.0.0** llega solo como dependencia transitiva de ClosedXML, y esa versión es Apache-2.0. La *Six Labors Split License* empieza en la 2.x. No hay referencias directas a `SixLabors.*`. **Al actualizar ClosedXML, revisa qué versión de `SixLabors.Fonts` arrastra** (backend §2).

Las fotos de artículos (B-24) no usan librería de imágenes: el servidor lee el encabezado PNG, JPEG o WebP con código propio.

## Frontend (npm)

Lo que llega al navegador son 13 paquetes:

| Paquete | Versión | Licencia |
|---|---|---|
| @angular/cdk, common, compiler, core, forms, material, platform-browser, router | 22.2.3 | MIT |
| @fontsource/roboto | 5.3.0 | OFL-1.1 (licencia libre de fuentes) |
| entities | 8.1.0 | BSD-2-Clause |
| parse5 | 8.0.1 | MIT |
| rxjs | 7.8.2 | Apache-2.0 |
| tslib | 2.8.1 | 0BSD |

El subconjunto de íconos (`public/fonts/material-symbols.woff2`) sale del paquete `material-symbols` 0.48.0, Apache-2.0, en desarrollo.

Herramientas de desarrollo directas, todas libres:

| Paquete | Versión | Licencia |
|---|---|---|
| @axe-core/playwright (y axe-core) | 4.14.0 | MPL-2.0 (F-24, pruebas de accesibilidad) |
| lighthouse | 13.5.0 | Apache-2.0 (F-24, `npm run lighthouse`) |
| @angular/build, @angular/cli, @angular/compiler-cli | 22.2.3 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| typescript | 6.0.3 | Apache-2.0 |
| vitest | 5.0.5 | MIT |
| jsdom | 30.1.3 | MIT |
| eslint, @eslint/js, angular-eslint, typescript-eslint | | MIT |
| prettier | 3.9.10 | MIT |
| openapi-typescript | 7.13.0 | MIT |

Todo `node_modules` (442 paquetes) es MIT, Apache-2.0, ISC, BSD, MIT-0, BlueOak, 0BSD o similar. Las únicas licencias distintas son de herramientas de compilación que no se distribuyen con la aplicación:

- `lightningcss` (MPL-2.0, a través de Vite) y `axe-core` (MPL-2.0, pruebas): MPL es libre; ninguno llega al navegador.
- `caniuse-lite` (CC-BY-4.0, datos de compatibilidad de navegadores).
- `argparse` (Python-2.0).

**F-21** agregó `chart.js` **4.5.1** (MIT; versión exacta en `package.json`) con su única dependencia `@kurkle/color` 0.3.4 (MIT). Se carga de forma diferida en su propio chunk.

## Imágenes de contenedor e infraestructura

| Componente | Licencia |
|---|---|
| `mcr.microsoft.com/dotnet/sdk`, `aspnet`, `runtime-deps` 10.0 | MIT (.NET) sobre Debian |
| `node:24-alpine` (solo para compilar el frontend) | MIT |
| `caddy:2-alpine` | Apache-2.0 |
| `postgres:16` (desarrollo y demo) | PostgreSQL License |

## Cómo repetir la revisión

```bash
cd backend && dotnet list package --include-transitive --format json   # luego leer <license> de cada .nuspec en ~/.nuget/packages
cd frontend && npm ls --all --omit=dev --json                         # luego leer "license" de cada node_modules/<paquete>/package.json
```

Repítela antes de actualizar ClosedXML, Angular o cualquier paquete mayor, y cada vez que se agregue uno.
