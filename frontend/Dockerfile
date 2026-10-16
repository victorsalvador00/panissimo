# Imagen del frontend: build de Angular y Caddy sirviendo los archivos estáticos en /srv.
# En producción deploy/docker-compose.yml monta su Caddyfile (HTTPS, proxy de /api y /health).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist/sgo/browser /srv
