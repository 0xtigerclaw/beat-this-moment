#!/usr/bin/env bash
# Usage (root): gcp-install.sh HOSTNAME RUNTIME_TAR PRIVATE_ENV
set -euo pipefail
site=${1:?Public hostname required}
bundle=${2:?Runtime tar required}
config=${3:?Private environment file required}
[[ "$site" =~ ^[a-z0-9.-]+$ ]]
test -f /var/lib/beat-this-moment/bootstrap-complete
tar -xzf "$bundle" -C /opt/beat-this-moment
chown -R root:root /opt/beat-this-moment
chmod -R go-w /opt/beat-this-moment
if [[ ! -f /var/lib/beat-this-moment/challenges.json && -f /opt/beat-this-moment/migration/challenges.json ]]; then
  install -o btm -g btm -m 600 /opt/beat-this-moment/migration/challenges.json /var/lib/beat-this-moment/challenges.json
fi
rm -rf /opt/beat-this-moment/migration
install -o root -g root -m 600 "$config" /etc/beat-this-moment.env
cat >/etc/caddy/Caddyfile <<CADDY
$site {
    encode gzip
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
}
CADDY
caddy validate --config /etc/caddy/Caddyfile
systemctl restart beat-this-moment
systemctl reload caddy
for attempt in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/healthz; then
    echo
    echo 'Application health check passed.'
    exit 0
  fi
  sleep 2
done
echo 'Application failed its local health check.' >&2
exit 1
