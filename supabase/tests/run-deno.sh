#!/usr/bin/env bash
# Type-checks the Edge Functions and runs their Deno tests in Docker (no Deno install needed).
# Usage: bash supabase/tests/run-deno.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
docker run --rm -v "$PWD/supabase/functions:/fn" -v deno-cache:/deno-dir -w /fn denoland/deno:2.9.8 sh -c '
  deno check hello-video/index.ts send-reminders/index.ts room-join/index.ts trivia-act/index.ts &&
  deno test --allow-env --allow-net --allow-read --allow-sys _tests/deno.test.ts _tests/handlers.test.ts _tests/trivia.test.ts
'
node supabase/functions/_tests/reminder-text.test.ts
