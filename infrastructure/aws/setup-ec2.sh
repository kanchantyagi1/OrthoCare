#!/usr/bin/env bash
# OrthoCare AI — EC2 bootstrap (Ubuntu 22.04/24.04, t4g.small or larger)
#
# Provisions Node.js, PostgreSQL + pgvector, Nginx, PM2, and the app user/dir
# for running the NestJS backend bare-metal on a single EC2 instance (MVP).
#
# Usage (as a sudo-capable user, e.g. `ubuntu`):
#   chmod +x setup-ec2.sh
#   ADMIN_SSH_CIDR=203.0.113.5/32 ./setup-ec2.sh
#
# Safe to re-run: every step checks current state before changing it.
set -euo pipefail

APP_USER="${APP_USER:-orthocare}"
APP_DIR="${APP_DIR:-/opt/orthocare}"
DB_NAME="${DB_NAME:-orthocare}"
DB_USER="${DB_USER:-orthocare}"
DB_PASSWORD="${DB_PASSWORD:-change-me-$(openssl rand -hex 8)}"
NODE_MAJOR="${NODE_MAJOR:-20}"
ADMIN_SSH_CIDR="${ADMIN_SSH_CIDR:-}" # e.g. 203.0.113.5/32 — required to lock down SSH

log() { echo -e "\n[setup-ec2] $*\n"; }

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this as a sudo-capable non-root user (e.g. 'ubuntu'), not as root." >&2
  exit 1
fi

log "Updating apt and installing base packages"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg build-essential ufw git

# ---------------------------------------------------------------------------
# Firewall: only 80, 443, and (restricted) SSH
# ---------------------------------------------------------------------------
log "Configuring UFW (80, 443 open; SSH restricted to ADMIN_SSH_CIDR if set)"
sudo ufw --force reset >/dev/null 2>&1 || true
sudo ufw default deny incoming
sudo ufw default allow outgoing
if [[ -n "$ADMIN_SSH_CIDR" ]]; then
  sudo ufw allow from "$ADMIN_SSH_CIDR" to any port 22 proto tcp
else
  echo "WARNING: ADMIN_SSH_CIDR not set — leaving SSH on the AWS Security Group only."
  echo "         In the EC2 console, restrict the Security Group's inbound SSH (22) rule"
  echo "         to your admin IP/CIDR. Do NOT leave 0.0.0.0/0 on port 22."
fi
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  sudo npm install -g pm2
fi

# ---------------------------------------------------------------------------
# PostgreSQL + pgvector
# ---------------------------------------------------------------------------
if ! command -v psql >/dev/null 2>&1; then
  log "Installing PostgreSQL 16 + pgvector"
  sudo apt-get install -y postgresql postgresql-contrib
  # pgvector: build from source against the installed server (works across Ubuntu versions)
  PG_VERSION=$(psql -V | grep -oP '\d+' | head -1)
  sudo apt-get install -y "postgresql-server-dev-${PG_VERSION}" || sudo apt-get install -y postgresql-server-dev-all
  if [[ ! -d /tmp/pgvector ]]; then
    git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git /tmp/pgvector
  fi
  (cd /tmp/pgvector && make clean && make && sudo make install)
else
  log "PostgreSQL already installed"
fi

sudo systemctl enable postgresql
sudo systemctl start postgresql

log "Ensuring database/user/extension exist"
sudo -u postgres psql -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS vector;"

# PostgreSQL must NOT be publicly accessible — confirm it's bound to localhost only.
PG_CONF_DIR=$(sudo -u postgres psql -t -c "SHOW config_file;" | xargs dirname)
if ! sudo grep -q "^listen_addresses = 'localhost'" "${PG_CONF_DIR}/postgresql.conf" 2>/dev/null; then
  sudo sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "${PG_CONF_DIR}/postgresql.conf"
  sudo systemctl restart postgresql
fi

log "Database ready. DB_USER=${DB_USER} DB_NAME=${DB_NAME} (password only shown once below if freshly generated)"
echo "DB_PASSWORD=${DB_PASSWORD}"

# ---------------------------------------------------------------------------
# App user + directory
# ---------------------------------------------------------------------------
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating app user ${APP_USER}"
  sudo useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
sudo mkdir -p "$APP_DIR" "$APP_DIR/storage/documents"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Deploy your backend into ${APP_DIR} (git clone or rsync the backend/ folder's contents), then:"
cat <<EOF

  cd ${APP_DIR}
  npm ci --omit=dev
  # copy backend/.env.example -> ${APP_DIR}/.env and fill in real values, including:
  #   DATABASE_URL=postgres://${DB_USER}:<password>@localhost:5432/${DB_NAME}
  npm run migration:run   # applies database/migrations
  npm run build

EOF

# ---------------------------------------------------------------------------
# Nginx
# ---------------------------------------------------------------------------
if ! command -v nginx >/dev/null 2>&1; then
  log "Installing Nginx"
  sudo apt-get install -y nginx
fi
log "Copy infrastructure/nginx/orthocare.conf to /etc/nginx/sites-available/orthocare.conf,"
log "symlink into sites-enabled, remove the default site, then 'sudo nginx -t && sudo systemctl reload nginx'."
log "Use certbot (sudo apt-get install -y certbot python3-certbot-nginx) to provision a TLS cert for your domain."

# ---------------------------------------------------------------------------
# PM2 service (systemd-managed)
# ---------------------------------------------------------------------------
log "Once the backend is built, start it under PM2 as the app user, e.g.:"
cat <<EOF

  sudo -u ${APP_USER} pm2 start ${APP_DIR}/dist/main.js --name orthocare-backend
  sudo -u ${APP_USER} pm2 save
  # Then, as a sudo user, generate + enable the systemd startup hook:
  pm2 startup systemd -u ${APP_USER} --hp ${APP_DIR}

EOF

log "Done. Review the DB_PASSWORD printed above and store it securely (e.g. in ${APP_DIR}/.env only)."
