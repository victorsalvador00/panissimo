#!/bin/sh
# One compressed dump of the database into /backups, then deletes dumps older than BACKUP_RETENTION_DAYS.
# Uses the standard libpq variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) set by the compose file.
set -eu

file="/backups/sgo-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --compress=9 --file="$file.partial"
mv "$file.partial" "$file"
echo "Respaldo creado: $(basename "$file") ($(du -h "$file" | cut -f1))"

find /backups -name 'sgo-*.dump' -type f -mtime +"${BACKUP_RETENTION_DAYS:-14}" -print -delete | sed 's/^/Respaldo eliminado por antigüedad: /'
