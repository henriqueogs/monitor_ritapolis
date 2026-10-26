#!/bin/bash
set -euo pipefail
cd /opt/monitor-ritapolis

# Never discard production edits or touch the persistent data directory.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Deployment refused: tracked production files have local changes.' >&2
  exit 1
fi
git fetch origin master

# npm ci is the slowest step of the API downtime (stop -> start). Skip it when
# the lockfile being deployed is exactly the one already installed: the hash
# is written only after a successful npm ci, inside node_modules (which npm ci
# recreates), so a failed or partial install always reinstalls next time.
LOCK_MARKER=node_modules/.deploy-lock-hash
NEW_LOCK_HASH="$(git rev-parse origin/master:package-lock.json)"
INSTALLED_LOCK_HASH="$(cat "$LOCK_MARKER" 2>/dev/null || true)"
# Do not let the API launch workers while npm ci removes node_modules or git
# replaces code. systemctl stop invokes the coordinator's graceful shutdown,
# preserving in-flight checkpoints; data/ is never moved or modified here.
sudo systemctl stop monitor-ritapolis
if sudo systemctl is-active --quiet monitor-ritapolis; then
  echo 'Deployment refused: service did not stop.' >&2
  exit 1
fi

# A failed install must stay visibly failed, not start a half-installed app.
# Fix dependencies and start explicitly; never reset the database as recovery.
trap 'echo "Deployment failed: API stopped; inspect installation before starting." >&2' ERR
git merge --ff-only origin/master
if [[ -n "$NEW_LOCK_HASH" && "$NEW_LOCK_HASH" == "$INSTALLED_LOCK_HASH" ]]; then
  echo 'Dependencies unchanged (same package-lock.json): skipping npm ci.'
else
  npm ci --omit=dev
  mkdir -p node_modules
  echo "$NEW_LOCK_HASH" > "$LOCK_MARKER"
fi
sudo systemctl start monitor-ritapolis
trap - ERR
sleep 3
sudo systemctl is-active monitor-ritapolis
