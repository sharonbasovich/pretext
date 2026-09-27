#!/usr/bin/env bash
# Replay-only static export: lobby + replay + debrief with fixtures from
# /public. Route handlers can't be statically exported, so app/api is moved
# aside for the build and restored afterwards. Serve `out/` with any static
# host (e.g. `npx serve out`). Live calls need the normal server build.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d app/api ]; then
  mv app/api /tmp/pretext-api-staging
  restore() { mv /tmp/pretext-api-staging app/api; }
  trap restore EXIT
fi

PRETEXT_STATIC_EXPORT=1 npx next build
echo "static replay bundle → out/ (serve with: npx serve out)"
