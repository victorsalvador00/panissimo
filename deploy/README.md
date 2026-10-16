# Despliegue

## Uso local (situación actual)

Mientras no se contrate DigitalOcean, el sistema corre **solo en una computadora**, para pruebas y capacitación, con el compose de desarrollo y una base Postgres local. Los comandos son para PowerShell, desde la raíz del repositorio. Docker Desktop debe estar abierto.

```powershell
# Primera vez: copiar deploy/.env.example a deploy/.env y poner contraseñas y clave JWT propias.
docker compose -f deploy/docker-compose.dev.yml up -d          # base, API (migra y siembra al arrancar) y respaldos
curl http://localhost:8080/health/ready                         # 200 = listo (o el puerto de API_PORT)
docker compose -f deploy/docker-compose.dev.yml down            # detener (los datos se conservan)
```

### Respaldos

- El servicio `backup` hace un `pg_dump` al arrancar y luego cada `BACKUP_INTERVAL_HOURS` (default 24). Solo mientras el stack está encendido.
- Los archivos quedan en `deploy/backups/sgo-AAAAMMDD-HHMMSS.dump` y se borran después de `BACKUP_RETENTION_DAYS` (default 14).
- `deploy/backups/` no se sube a git porque contiene datos del negocio. **Copia esa carpeta periódicamente fuera de la computadora** (USB o nube): si el disco falla, se pierden base y respaldos juntos.

```powershell
# Respaldo inmediato (por ejemplo, antes de una capacitación o de actualizar el sistema)
docker compose -f deploy/docker-compose.dev.yml exec backup /scripts/backup.sh

# Restaurar: REEMPLAZA todos los datos por los del respaldo
docker compose -f deploy/docker-compose.dev.yml stop api
docker compose -f deploy/docker-compose.dev.yml exec backup /scripts/restore.sh sgo-20260925-051400.dump
docker compose -f deploy/docker-compose.dev.yml start api
```

Sin nombre de archivo, `restore.sh` lista los respaldos más recientes.

### Pasar después a DigitalOcean

1. Tomar un respaldo inmediato (arriba).
2. Hacer los pasos 1 a 3 de **Primera instalación** (abajo): base `sgo` vacía, DNS, clonar y llenar `deploy/.env`.
3. Cargar el respaldo en esa base vacía desde el equipo local (trae esquema, datos e historial de migraciones):
   ```powershell
   docker run --rm -v "${PWD}/deploy/backups:/backups" postgres:16 `
     pg_restore --no-owner --dbname "postgresql://<usuario>:<contraseña>@<host>:25060/sgo?sslmode=require" /backups/<archivo>.dump
   ```
4. En el Droplet: `docker compose build`, `docker compose run --rm migrate` (aplica solo las migraciones que falten) y `docker compose up -d`. **No** correr `--seed`: los datos base ya vienen en el respaldo.

## Demo en Oracle Cloud (Always Free)

Entorno de prueba para el cliente antes de contratar el hosting: el mismo stack de producción más un Postgres local en contenedor (`docker-compose.demo.yml`) y respaldos diarios en `deploy/backups/`. La VM es ARM (Ampere); las imágenes se construyen en la VM y el bundle de migraciones detecta la arquitectura.

1. En la VM (Ubuntu 24.04 con Docker), clonar y crear `.env`:
   ```bash
   git clone https://github.com/victorsalvador00/sys-gestion-operativa.git sgo
   cd sgo/deploy
   cp .env.example .env
   ```
2. En `deploy/.env` (las demás variables de producción igual):
   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.demo.yml
   ASPNETCORE_ENVIRONMENT=Production
   POSTGRES_PASSWORD=<contraseña larga>
   SGO__ConnectionStrings__Default=Host=db;Port=5432;Database=sgo;Username=sgo;Password=<la misma>
   SGO_DOMAIN=sgo.<ip-con-guiones>.sslip.io     # o un subdominio propio con registro A a la IP
   ```
3. Build del frontend (con un contenedor de Node; no hace falta instalar Node en la VM):
   ```bash
   docker run --rm -v "$PWD/../frontend:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"
   ```
4. Construir, migrar, sembrar y levantar (con `COMPOSE_FILE` en `.env` no hace falta `-f`):
   ```bash
   docker compose build
   docker compose run --rm migrate
   docker compose run --rm api --seed
   docker compose up -d
   ```
5. Verificar `https://<SGO_DOMAIN>/health/ready` y entrar con el administrador.

Para publicar cambios: `git pull`, repetir el paso 3 si cambió el frontend y luego el paso 4 sin `--seed`.

# Despliegue en producción

Servidor: un Droplet de DigitalOcean con Docker. Base de datos: Postgres administrado de DigitalOcean (no corre en el Droplet).

| Servicio | Qué es |
|---|---|
| `api` | Imagen del backend (`backend/Dockerfile`, target `runtime`). Sin puertos publicados. |
| `web` | Caddy: HTTPS automático, sirve el SPA y hace proxy de `/api/*` y `/health/*` a `api:8080`. |
| `migrate` | Bundle de migraciones de EF Core (target `migrator`). Solo se ejecuta a mano. |

Las imágenes se construyen **en el Droplet** a partir del repositorio (no hay registro de imágenes).

## Primera instalación

1. En DigitalOcean:
   - Crear la base `sgo` en el Postgres administrado y agregar el Droplet a sus *trusted sources*.
   - Apuntar el registro DNS `A` del dominio a la IP del Droplet.
2. En el Droplet, con Docker y el plugin `compose` instalados:
   ```bash
   git clone https://github.com/victorsalvador00/sys-gestion-operativa.git sgo
   cd sgo/deploy
   cp .env.example .env
   ```
3. Editar `deploy/.env`:
   - `SGO__ConnectionStrings__Default` con los datos del Postgres administrado y `SSL Mode=Require`.
   - `SGO__Jwt__Key`: una clave nueva, por ejemplo `openssl rand -base64 48`.
   - `SGO__Seed__AdminEmail` y `SGO__Seed__AdminPassword`: el primer administrador.
   - `SGO_DOMAIN` y `ACME_EMAIL`.
   - Ignorar la sección de Postgres local (`POSTGRES_*`, `API_PORT`), que es solo para desarrollo.
4. Construir, migrar, sembrar y levantar:
   ```bash
   docker compose build
   docker compose run --rm migrate          # aplica todas las migraciones
   docker compose run --rm api --seed       # ubicaciones, unidades, roles, parámetros y administrador
   docker compose up -d
   ```
5. Verificar:
   - `curl https://<dominio>/health/ready` debe responder `200`.
   - Iniciar sesión con el administrador y **cambiar su contraseña**.
   - Después se pueden borrar `SGO__Seed__AdminPassword` y `SGO__Seed__AdminEmail` de `.env`: la semilla solo crea el administrador si no existe.

Mientras no exista el build del frontend (`SPA_DIST`), el sitio muestra una página de mantenimiento; la API funciona igual.

## Publicar una versión nueva

```bash
cd sgo
git pull
cd deploy
docker compose build
docker compose run --rm migrate      # SIEMPRE antes de levantar la versión nueva
docker compose up -d                 # reemplaza api (y web si cambió)
docker image prune -f
```

- La API **nunca** aplica migraciones al arrancar en producción. Si `migrate` falla, no se ejecuta `up`: la versión anterior sigue funcionando.
- Las migraciones se escriben compatibles hacia atrás (columnas nuevas opcionales, sin renombrar en el mismo despliegue), así la versión anterior puede convivir unos segundos con el esquema nuevo.
- `docker compose run --rm api --seed` solo hace falta si la versión agrega datos base. La semilla es idempotente.

## Frontend

El build de producción de Angular (`npm run build`) genera `frontend/dist/sgo/browser`, la ruta por defecto de `SPA_DIST`. Caddy lo sirve con caché larga para los archivos con hash y sin caché para `index.html`. Todas las rutas del cliente regresan `index.html`.

## Operación

- **Logs:** `docker compose logs -f api` (JSON). Docker rota cada archivo en 20 MB y conserva 5.
- **Reiniciar:** `docker compose restart api`.
- **Certificados:** Caddy los obtiene y renueva solo. Se guardan en el volumen `caddy_data`, que no debe borrarse.
- **Respaldos:** el Postgres administrado hace respaldos diarios con recuperación a un punto en el tiempo. Antes de una migración riesgosa, conviene sacar un respaldo manual desde el panel.
- **Revertir:** `git checkout <commit anterior>`, luego `docker compose build` y `docker compose up -d`. Si la versión nueva ya migró la base, el esquema queda adelantado. Por eso las migraciones deben ser compatibles hacia atrás; `migrate` no revierte.
