# Frontend image (frontend §10): build with Node, serve the static files with Caddy.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist/panissimo-web/browser /srv
# Standalone serving; in production deploy/Caddyfile (mounted by the compose file) also proxies /api to the backend.
COPY Caddyfile /etc/caddy/Caddyfile
