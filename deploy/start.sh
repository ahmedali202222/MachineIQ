#!/usr/bin/env bash
# Starts PostgreSQL, the machine simulator and the MachineIQ backend in one container.
set -euo pipefail

PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
PGDATA=/var/lib/postgresql/machineiq

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  # Small footprint for a 512 MB instance
  cat >> "$PGDATA/postgresql.conf" <<CONF
listen_addresses = 'localhost'
shared_buffers = 16MB
max_connections = 20
CONF
fi
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/postgres.log -w start" >/dev/null
su postgres -c "psql -q -tc \"SELECT 1 FROM pg_roles WHERE rolname='machineiq'\" | grep -q 1 || psql -q -c \"CREATE ROLE machineiq LOGIN PASSWORD 'machineiq'\" -c \"CREATE DATABASE machineiq OWNER machineiq\""
echo "PostgreSQL started"

cd /app/simulator
OPCUA_ENDPOINT=opc.tcp://127.0.0.1:4840/machineiq/ /app/venv/bin/python server.py &
echo "Simulator started"

cd /app
exec java -Xmx220m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k \
  -jar app.jar \
  --server.port="${PORT}" \
  --spring.web.resources.static-locations=file:/app/static/ \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/machineiq \
  --machineiq.opcua.endpoint=opc.tcp://127.0.0.1:4840/machineiq/ \
  --machineiq.demo.simulator-control-url=http://127.0.0.1:8090 \
  --machineiq.retention-days=1
