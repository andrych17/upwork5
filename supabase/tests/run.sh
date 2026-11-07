#!/usr/bin/env bash
# Runs schema.sql (twice, to prove it is safe to re-run) and the feature checks in a throwaway Postgres 16.
# Usage: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
name="mdc-schema-test-$$"
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=local postgres:16 >/dev/null
trap 'docker stop "$name" >/dev/null' EXIT
until docker exec "$name" pg_isready -U postgres -q 2>/dev/null; do sleep 0.5; done
sleep 1
psql() { docker exec -i -e PGOPTIONS="${PGOPTIONS:-}" "$name" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql < tests/stub.sql
grep -v '^create extension if not exists pg_cron;' schema.sql > /tmp/"$name".sql
PGOPTIONS="-c client_min_messages=warning" psql < /tmp/"$name".sql >/dev/null
PGOPTIONS="-c client_min_messages=warning" psql < /tmp/"$name".sql >/dev/null
rm -f /tmp/"$name".sql
psql < tests/features.sql
psql < tests/admin.sql
psql < tests/schedule.sql
psql < tests/payments.sql
psql < tests/rooms.sql
psql < tests/buddies.sql
psql < tests/games.sql
psql < tests/trivia.sql
psql < tests/roles.sql
psql < tests/keys.sql
psql < tests/errors.sql
echo "schema checks: ok"
