#!/usr/bin/env bash
# ARC LABS code runner on an AWS EC2 server (Ubuntu 24.04).
#
# Paste into the EC2 browser terminal (EC2 Instance Connect):
#   curl -fsSL <raw link to this file> -o setup.sh && sudo bash setup.sh
# or, if the repository is private, paste this file's text into `nano setup.sh`, then `sudo bash setup.sh`.
#
# What it does (safe to run again — it updates the runner to the latest code):
#   1. installs Docker and git, adds 2 GB of swap
#   2. downloads apps/runner from GitHub and builds it
#   3. starts the runner + Caddy (free HTTPS certificate for <ip>.sslip.io), both restart on boot
#   4. keeps the address right after a Stop/Start (re-checks the public IP at every boot)
#   5. prints the CODE_RUNNER_URL and CODE_RUNNER_TOKEN to put in Vercel
set -euo pipefail

REPO="${ARC_REPO:-techarclab/arclabs-lms}"
BRANCH="${ARC_BRANCH:-main}"
DIR=/opt/arc-runner
PARALLEL="${RUNNER_PARALLEL:-4}"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Run with sudo:  sudo bash setup.sh"

public_ip() {
  local t
  t=$(curl -fsS -m 5 -X PUT http://169.254.169.254/latest/api/token \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null) || true
  curl -fsS -m 5 ${t:+-H "X-aws-ec2-metadata-token: $t"} \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || curl -fsS -m 5 https://checkip.amazonaws.com
}

# Writes the Caddy config for this server's current public address; restarts Caddy if it changed.
refresh_host() {
  local ip host new
  ip=$(public_ip | tr -d '[:space:]')
  [ -n "$ip" ] || die "Could not find this server's public IP. Give it a public IP / Elastic IP."
  host="${ip//./-}.sslip.io"
  new="$host {
	reverse_proxy arc-runner:10000
}"
  if [ "$(cat "$DIR/Caddyfile" 2>/dev/null)" != "$new" ]; then
    printf '%s\n' "$new" >"$DIR/Caddyfile"
    docker restart arc-caddy >/dev/null 2>&1 || true
  fi
  echo "$host" >"$DIR/host"
}

main() {
if [ "${1:-}" = "--refresh-host" ]; then # run by arc-runner-host.service at every boot
  refresh_host
  return 0
fi

say "Installing Docker and git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io git curl ca-certificates >/dev/null
systemctl enable --now docker >/dev/null

if ! swapon --show | grep -q /swapfile; then
  say "Adding 2 GB swap (keeps big compiles from running out of memory)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

mkdir -p "$DIR" && chmod 700 "$DIR"

say "Downloading the runner from github.com/$REPO ($BRANCH)"
export GIT_TERMINAL_PROMPT=0
AUTH=()
if ! git ls-remote "https://github.com/$REPO.git" >/dev/null 2>&1; then
  echo "The repository is private. Create a GitHub token with read access to it:"
  echo "  GitHub → Settings → Developer settings → Fine-grained tokens → Generate"
  echo "  Repository access: only $REPO · Permissions: Contents → Read-only"
  read -r -s -p "Paste the token here (it is not shown or saved): " GH_TOKEN </dev/tty
  echo
  AUTH=(-c "http.extraHeader=Authorization: Basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)")
fi
rm -rf "$DIR/src"
git "${AUTH[@]}" clone -q --depth 1 --branch "$BRANCH" --filter=blob:none --sparse \
  "https://github.com/$REPO.git" "$DIR/src" || die "Could not download the repository (check the token)."
git -C "$DIR/src" sparse-checkout set apps/runner infra/aws
unset GH_TOKEN AUTH

say "Building the runner (2–5 minutes the first time)"
docker build -q -t arc-runner "$DIR/src/apps/runner" >/dev/null

if [ ! -s "$DIR/runner-token" ]; then
  head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40 >"$DIR/runner-token"
  chmod 600 "$DIR/runner-token"
fi
TOKEN=$(cat "$DIR/runner-token")

say "Starting the runner and HTTPS"
docker network create arc >/dev/null 2>&1 || true
docker rm -f arc-runner >/dev/null 2>&1 || true
docker run -d --name arc-runner --network arc --restart unless-stopped \
  -e RUNNER_TOKEN="$TOKEN" -e PORT=10000 -e RUNNER_PARALLEL="$PARALLEL" \
  --memory "$(($(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 - 400))m" --pids-limit 512 \
  arc-runner >/dev/null

refresh_host
docker rm -f arc-caddy >/dev/null 2>&1 || true
docker run -d --name arc-caddy --network arc --restart unless-stopped \
  -p 80:80 -p 443:443 -v "$DIR/Caddyfile:/etc/caddy/Caddyfile:ro" -v arc-caddy-data:/data \
  caddy:2 >/dev/null

# Re-check the address at every boot (in case the server has no Elastic IP).
install -m 755 "$DIR/src/infra/aws/runner-setup.sh" /usr/local/sbin/arc-runner-setup.new
mv -f /usr/local/sbin/arc-runner-setup.new /usr/local/sbin/arc-runner-setup
cat >/etc/systemd/system/arc-runner-host.service <<'EOF'
[Unit]
Description=ARC LABS runner: point HTTPS at this server's current public address
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/arc-runner-setup --refresh-host

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable arc-runner-host.service >/dev/null 2>&1

HOST=$(cat "$DIR/host")
say "Waiting for the HTTPS certificate (up to 2 minutes)"
OK=""
for _ in $(seq 1 40); do
  if OK=$(curl -fsS -m 5 "https://$HOST/health" 2>/dev/null); then break; fi
  OK=""
  sleep 3
done
[ -n "$OK" ] || die "https://$HOST/health is not answering. Check the security group allows ports 80 and 443 from anywhere, then run:  sudo bash setup.sh"

cat <<EOF

────────────────────────────────────────────────────────────────────
 ARC LABS code runner is live.   $OK

 Put these in Vercel → arclabs-api → Settings → Environment Variables,
 then Deployments → ⋯ → Redeploy:

   CODE_RUNNER        arc
   CODE_RUNNER_URL    https://$HOST
   CODE_RUNNER_TOKEN  $TOKEN

 Keep the token private (don't share it in chats or screenshots).
 Show it again any time:  sudo cat $DIR/runner-token
 Update to the latest runner code:  sudo arc-runner-setup
────────────────────────────────────────────────────────────────────
EOF
}

# Everything is inside main() so bash reads the whole file before running (the script replaces
# its own installed copy when updating).
main "$@"
