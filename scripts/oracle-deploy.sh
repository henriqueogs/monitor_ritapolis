#!/bin/bash
set -euo pipefail
cd /opt/monitor-ritapolis

# Never discard production edits or touch the persistent data directory.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Deployment refused: tracked production files have local changes.' >&2
  exit 1
fi
git fetch origin master
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
npm ci --omit=dev
sudo systemctl start monitor-ritapolis
trap - ERR
sleep 3
sudo systemctl is-active monitor-ritapolis
