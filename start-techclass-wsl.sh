#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WSL_IP=""
for _ in $(seq 1 30); do
  WSL_IP="$(
    ip -4 -o addr show dev eth0 scope global |
      awk '{ split($4, address, "/"); print address[1]; exit }'
  )"
  if [[ -n "$WSL_IP" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$WSL_IP" ]]; then
  echo "Could not determine the WSL eth0 address." >&2
  exit 1
fi

export WSL_IP
printf '%s\n' "$WSL_IP" > .wsl-ip
touch .env
if grep -q '^WSL_IP=' .env; then
  sed -i "s|^WSL_IP=.*|WSL_IP=$WSL_IP|" .env
else
  printf '\nWSL_IP=%s\n' "$WSL_IP" >> .env
fi

docker rm -f techclass.cevdetabbas.com >/dev/null 2>&1 || true

exec /usr/bin/docker compose \
  -p techclass-wsl \
  -f docker-compose.yml \
  up -d --build --remove-orphans
