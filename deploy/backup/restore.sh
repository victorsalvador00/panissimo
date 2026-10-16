#!/bin/sh
# Restores a dump from /backups over the current database (replaces all its data).
# Stop the API first: docker compose -f deploy/docker-compose.dev.yml stop api
set -eu

if [ $# -ne 1 ] || [ ! -f "/backups/$1" ]; then
    echo "Uso: restore.sh <archivo .dump dentro de deploy/backups>" >&2
    ls -1t /backups/*.dump 2>/dev/null | head -5 | xargs -r -n1 basename | sed 's/^/  /' >&2
    exit 1
fi

pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$PGDATABASE" "/backups/$1"
echo "Base restaurada desde $1. Vuelve a levantar la API."
