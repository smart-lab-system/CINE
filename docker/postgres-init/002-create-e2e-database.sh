#!/bin/bash
set -euo pipefail

# Isolated database for API e2e tests — never shares data with dev lab_management.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
	SELECT 'CREATE DATABASE lab_management_e2e'
	WHERE NOT EXISTS (
	  SELECT FROM pg_database WHERE datname = 'lab_management_e2e'
	)\gexec
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "lab_management_e2e" <<-'EOSQL'
	CREATE SCHEMA IF NOT EXISTS lab_management;
EOSQL
