#!/usr/bin/env bash
# Run on the VM to install a new build from /tmp/btm-runtime.tgz.
# Backs up the app, data, and settings first, and rolls back if the app fails its health check.
set -euo pipefail
APP="${APP_DIR:-/opt/beat-this-moment}"
DATA="${DATA_FILE:-/var/lib/beat-this-moment/challenges.json}"
ENVF="${ENV_FILE:-/etc/beat-this-moment.env}"
TGZ="${TGZ_FILE:-/tmp/btm-runtime.tgz}"
HEALTH="${HEALTH_URL:-http://127.0.0.1:3000/healthz}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
test -f "$TGZ"
APP_BAK="$APP.bak-$STAMP"
DATA_BAK="$DATA.bak-$STAMP"
ENV_BAK="$ENVF.bak-$STAMP"
sudo cp -a "$APP" "$APP_BAK"
sudo cp -p "$DATA" "$DATA_BAK"
sudo cp -p "$ENVF" "$ENV_BAK"
echo "Backups: $APP_BAK $DATA_BAK $ENV_BAK"
rollback() {
  echo "FAILED. Rolling back."
  sudo rm -rf "$APP"
  sudo cp -a "$APP_BAK" "$APP"
  sudo cp -p "$ENV_BAK" "$ENVF"
  sudo cp -p "$DATA_BAK" "$DATA"
  sudo systemctl restart beat-this-moment
}
trap rollback ERR
sudo tar -xzf "$TGZ" -C "$APP"
sudo chown -R root:root "$APP"
sudo chmod -R go-w "$APP"
sudo chmod -R go+rX "$APP"
sudo grep -q '^TRUST_PROXY=1$' "$ENVF" || echo 'TRUST_PROXY=1' | sudo tee -a "$ENVF" >/dev/null
sudo systemctl restart beat-this-moment
ok=
for attempt in $(seq 1 15); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
test -n "$ok"
trap - ERR
systemctl is-active beat-this-moment
rm -f "$TGZ"
echo "Deploy complete."
