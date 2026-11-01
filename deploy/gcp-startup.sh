#!/usr/bin/env bash
# Run as root on a new Debian 12 Compute Engine VM. No secrets in metadata.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils git caddy

if [[ ! -x /opt/node/bin/node ]]; then
  work=$(mktemp -d)
  curl -fsS https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$work/SHASUMS256.txt"
  archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ {print $2}' "$work/SHASUMS256.txt")
  [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64.tar.xz$ ]]
  curl -fsS "https://nodejs.org/dist/latest-v24.x/$archive" -o "$work/$archive"
  (cd "$work" && awk -v name="$archive" '$2 == name' SHASUMS256.txt | sha256sum -c -)
  mkdir -p /opt/node
  tar -xJf "$work/$archive" -C /opt/node --strip-components=1
  rm -rf "$work"
fi

id btm >/dev/null 2>&1 || useradd --system --home /var/lib/beat-this-moment --shell /usr/sbin/nologin btm
install -d -m 700 -o btm -g btm /var/lib/beat-this-moment
# Source is installed separately via authenticated IAP SSH.
mkdir -p /opt/beat-this-moment
cat >/etc/systemd/system/beat-this-moment.service <<'UNIT'
[Unit]
Description=Beat This Moment game and Twitch bot
After=network-online.target
Wants=network-online.target
ConditionPathExists=/etc/beat-this-moment.env
ConditionPathExists=/opt/beat-this-moment/server.mjs

[Service]
Type=simple
User=btm
Group=btm
WorkingDirectory=/opt/beat-this-moment
EnvironmentFile=/etc/beat-this-moment.env
ExecStart=/opt/node/bin/node server.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/beat-this-moment
MemoryMax=600M
LimitNOFILE=4096
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable beat-this-moment
touch /var/lib/beat-this-moment/bootstrap-complete
echo 'Beat This Moment bootstrap complete; application and secrets can now be installed.'
