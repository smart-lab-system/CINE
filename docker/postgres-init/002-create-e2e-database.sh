#!/bin/bash
# Dedicated e2e database (api jest suites). Demo/dev keep POSTGRES_DB.
# Idempotent — safe if the role already created the DB on a reused volume
# via `pnpm --filter api db:ensure-e2e`.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
SELECT 'CREATE DATABASE examcollect_e2e'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'examcollect_e2e')\gexec
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname examcollect_e2e <<-EOSQL
CREATE SCHEMA IF NOT EXISTS examcollect;
EOSQL
