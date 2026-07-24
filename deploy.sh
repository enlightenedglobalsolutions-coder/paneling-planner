#!/bin/bash
# ============================================================================
#  Stagger deploy — delegates to the one EGS deploy script.
#
#  Per EGS-DECISIONS.md: egs-deploy.sh takes a repo path and lives in ONE
#  place. This is a thin entry point, not a copy — there is nothing to drift.
#
#  USAGE (all flags pass straight through to egs-deploy.sh)
#    ./deploy.sh --quick -m "fix stagger rounding"
#    ./deploy.sh --full -m "v3 jobs overlay"
#    ./deploy.sh --dry-run
#    ./deploy.sh --help
# ============================================================================
set -u

REPO="$(cd "$(dirname "$0")" && pwd)"
EGS="$(cd "$REPO/../.." && pwd)/egs-deploy.sh"

if [ ! -x "$EGS" ]; then
  echo "egs-deploy.sh not found or not executable at:" >&2
  echo "  $EGS" >&2
  echo "(expected two levels up from this repo — is the EGS volume mounted?)" >&2
  exit 1
fi

exec "$EGS" "$REPO" "$@"
