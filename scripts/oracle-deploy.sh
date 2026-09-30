#!/bin/bash
set -euo pipefail
cd /opt/monitor-ritapolis

# Never discard production edits or touch the persistent data directory.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Deployment refused: tracked production files have local changes.' >&2
  exit 1
fi
git fetch origin master
git merge --ff-only origin/master
npm ci --omit=dev
sudo systemctl restart monitor-ritapolis
sleep 3
sudo systemctl is-active monitor-ritapolis
