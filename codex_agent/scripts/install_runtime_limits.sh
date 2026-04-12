#!/usr/bin/env bash
# install_runtime_limits.sh - apply conservative user-systemd resource caps for automation services
set -euo pipefail

SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
GW_DIR="${SYSTEMD_USER_DIR}/openclaw-gateway.service.d"
WD_DIR="${SYSTEMD_USER_DIR}/ux-master-loop-watchdog.service.d"

mkdir -p "$GW_DIR" "$WD_DIR"

cat > "${GW_DIR}/override.conf" <<'EOF'
[Service]
MemoryHigh=700M
MemoryMax=1G
TasksMax=128
CPUQuota=120%
EOF

cat > "${WD_DIR}/override.conf" <<'EOF'
[Service]
MemoryHigh=128M
MemoryMax=256M
TasksMax=64
CPUQuota=50%
EOF

systemctl --user daemon-reload
echo "installed runtime limits:"
echo "- ${GW_DIR}/override.conf"
echo "- ${WD_DIR}/override.conf"
