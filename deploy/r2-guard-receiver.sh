#!/bin/bash
set -euo pipefail
cd /opt/monitor-ritapolis
exec /usr/bin/node scripts/receive-r2-guard.js
