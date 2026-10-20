# Despliegue de SGO Paníssimo

Tres formas de levantar el sistema (backend §12):

| Archivo | Para qué | Base de datos |
|---|---|---|
| `docker-compose.dev.yml` | Desarrollo local (API con `dotnet watch`, puerto 8090) | Postgres en contenedor |
| `docker-compose.yml` | **Producción** en un Droplet de DigitalOcean | Postgres administrado de DigitalOcean |
| `docker-compose.yml` + `docker-compose.demo.yml` | Demo en Oracle Cloud Free (Ampere arm64 o x64) | Postgres en contenedor con respaldos diarios |

Servicios de producción:

- **`api`:** imagen `aspnet:10.0`, usuario sin privilegios, puerto 8080 interno.
- **`web`:** Caddy con HTTPS automático. Sirve el build de Angular, pasa `/api` y `/health` a la API y muestra `maintenance/index.html` (503) si falta el build.
- **`migrate`:** bundle de migraciones de EF Core, perfil `tools`. Nunca se migra al arrancar la API en producción.

Las imágenes se construyen en el servidor; no hay registro de imágenes.

## Requisitos del servidor

- Docker Engine 24+ con el plugin `docker compose`.
- Puertos 80 y 443 abiertos y un nombre DNS (registro A) apuntando al servidor: Caddy obtiene el certificado al arrancar.
- Producción: un clúster de **PostgreSQL 16 administrado**, con el Droplet en sus *trusted sources*. La conexión lleva `SSL Mode=Require`.
- 2 GB de RAM como mínimo. La compilación del frontend es la que más memoria usa; con 1 GB agrega swap.

## Primera instalación (producción)

```bash
git clone <repositorio> panissimo && cd panissimo/deploy
cp .env.example .env
nano .env      # ver "Variables" abajo
nano seed/locations.csv   # sucursales: codigo,nombre,direccion

docker compose build                    # api, web y migrate
docker compose run --rm migrate         # crea el esquema
docker compose run --rm api --seed      # solo la primera vez: unidades, Planta, sucursales, roles, admin, parámetros
docker compose up -d
docker compose ps                       # api y web en "running"
curl -fsS https://$PAN_DOMAIN/health/ready   # "Healthy"
```

Después de la semilla, borra `PAN__Seed__AdminPassword` de `.env` (solo se usa para crear al administrador) y cambia esa contraseña desde la aplicación.

## Actualizar a una versión nueva

```bash
cd panissimo && git pull
cd deploy
docker compose build
docker compose run --rm migrate         # siempre antes de levantar la versión nueva
docker compose up -d                    # recrea solo lo que cambió
docker image prune -f
```

Si una migración falla, la API anterior sigue corriendo: el bundle aplica cada migración en su transacción. Antes de una migración grande, saca un respaldo de la base administrada (ver "Respaldos").

## Demo (Oracle Cloud Free)

Igual que producción, pero con el overlay y Postgres local:

```bash
cp .env.example .env    # POSTGRES_*, PAN__Jwt__Key, PAN_DOMAIN, PAN__Seed__*
# PAN__ConnectionStrings__Default apunta al contenedor:
#   Host=postgres;Port=5432;Database=<POSTGRES_DB>;Username=<POSTGRES_USER>;Password=<POSTGRES_PASSWORD>
alias dc='docker compose -f docker-compose.yml -f docker-compose.demo.yml'
dc build
dc up -d postgres
dc run --rm migrate
dc run --rm api --seed
dc up -d
```

El `Dockerfile` del backend compila el bundle para `linux-arm64` o `linux-x64` según la arquitectura del servidor.

## Variables (`deploy/.env`)

| Variable | Producción | Notas |
|---|---|---|
| `PAN_DOMAIN` | `sgo.panissimo.com.mx` | Nombre público; Caddy saca el certificado |
| `PAN__ConnectionStrings__Default` | `Host=…;Port=25060;Database=panissimo;Username=…;Password=…;SSL Mode=Require` | Base administrada |
| `PAN__Jwt__Key` | `openssl rand -base64 48` | ≥ 32 bytes. Cambiarla cierra todas las sesiones |
| `PAN__Jwt__Issuer` / `PAN__Jwt__Audience` | `panissimo` | |
| `PAN__Seed__AdminEmail` / `PAN__Seed__AdminPassword` | | Solo para `--seed`; la contraseña: 10+ caracteres con mayúscula, minúscula y número |
| `PAN__RateLimiting__LoginPermitLimit` | `10` (por omisión) | Intentos de inicio de sesión por minuto por IP |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | | Solo desarrollo y demo |

Los secretos nunca se versionan: `.env` está en `.gitignore`.

## Respaldos

- **Producción:** la base administrada de DigitalOcean hace respaldos diarios con recuperación a un punto en el tiempo (7 días). Para uno manual antes de una migración: `pg_dump -Fc "$PAN__ConnectionStrings__Default"` desde una máquina con acceso, o el respaldo bajo demanda del panel.
- **Demo y desarrollo:** el servicio `backup` deja `pg_dump` comprimidos en `deploy/backups/` cada `BACKUP_INTERVAL_HOURS` y conserva `BACKUP_RETENTION_DAYS` días. Restaurar: `backup/restore.sh` (lee sus instrucciones).

## Diagnóstico

```bash
docker compose logs -f api          # JSON compacto (Serilog); cada error trae su traceId, el mismo que ve el usuario
docker compose logs -f web          # Caddy: certificados y accesos
docker compose exec web caddy reload --config /etc/caddy/Caddyfile   # tras editar el Caddyfile
curl -fsS https://$PAN_DOMAIN/health/live    # la API responde
curl -fsS https://$PAN_DOMAIN/health/ready   # y llega a la base
```

- **Página de mantenimiento:** sale si la imagen `web` no tiene el build. Reconstruye con `docker compose build web && docker compose up -d web`.
- **413 al subir un archivo:** límites de 5 MB para Excel, 2 MB para CSV y 400 KB para fotos (backend §9).
- **Rendimiento:** `docs/rendimiento.md` explica cómo medir con datos de volumen.

## Verificado

El 2026-10-18 se construyeron las tres imágenes y se corrió la secuencia completa con el overlay de demo sobre una base vacía: `migrate` (bundle con las 25 migraciones), `api --seed`, `up -d`, `/health/ready` *Healthy*, la SPA servida por Caddy e inicio de sesión del administrador por `/api`. Los logs de la API quedaron sin errores.
