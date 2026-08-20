#!/usr/bin/env bash
set -euo pipefail

# Host ports 4000/3000 are remapped to 4010/3010 in docker-compose.yml on
# this dev machine because other, unrelated processes already occupy
# 3000/4000 (same class of conflict Task 2 hit with the datastores) —
# container-internal ports (and api<->web Docker-network calls) are
# unaffected and remain 4000/3000.
API_PORT="${API_PORT:-4010}"
WEB_PORT="${WEB_PORT:-3010}"

echo "Checking API health..."
curl --fail --silent "http://localhost:${API_PORT}/health" | grep -q '"status":"ok"'

echo "Checking Swagger docs..."
curl --fail --silent "http://localhost:${API_PORT}/api-docs-json" > /dev/null

echo "Checking web app responds..."
curl --fail --silent "http://localhost:${WEB_PORT}/login" > /dev/null

echo "All smoke checks passed."
