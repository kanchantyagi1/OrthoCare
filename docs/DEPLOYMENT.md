# OrthoCare AI — Deployment Runbook

This is a literal, step-by-step runbook for taking the backend from this repo to a live MVP on
AWS. It assumes you have: an AWS account with billing enabled, a domain (or subdomain) you can
point at the server, and the OpenAI / Firebase credentials described below.

Two deployment paths are provided; pick one (see `infrastructure/docker/README.md` for the
tradeoffs):

- **A. Bare-metal on EC2** via `infrastructure/aws/setup-ec2.sh`
- **B. Docker Compose on EC2** via `infrastructure/docker/docker-compose.prod.yml`

Steps 1-4 and 8-10 apply to both; step 5 branches.

---

## Quick reference: the current live deployment

The backend is already deployed this way, on an existing EC2 `t4g.small` that **also runs an
unrelated application stack**. It is isolated from that stack by Compose project name
(`name: orthocare`), its own network and volumes, and a distinct host port — the other stack
owns 80/443, so OrthoCare is published on **8081** and the mobile app talks to it directly
(no Nginx, no domain, no TLS — see the warning below).

Deployed/managed over **AWS Systems Manager** (no SSH key needed, since the instance runs the SSM
agent):

```bash
# one-time: clone and bring the stack up
aws ssm send-command --instance-ids <instance-id> --document-name AWS-RunShellScript \
  --parameters 'commands=[
    "git clone https://github.com/<owner>/OrthoCare.git /opt/orthocare",
    "cd /opt/orthocare/infrastructure/docker",
    "docker compose -f docker-compose.prod.yml up -d --build",
    "docker compose -f docker-compose.prod.yml exec -T backend npm run migration:run",
    "docker compose -f docker-compose.prod.yml exec -T backend npm run seed:demo"
  ]'

# redeploy after pushing changes
aws ssm send-command --instance-ids <instance-id> --document-name AWS-RunShellScript \
  --parameters 'commands=[
    "cd /opt/orthocare && git pull --ff-only",
    "cd infrastructure/docker && docker compose -f docker-compose.prod.yml up -d --build"
  ]'
```

`infrastructure/docker/.env` is generated **on the server** with a random `POSTGRES_PASSWORD` and
`JWT_SECRET` (via `openssl rand`) and is never committed. `BACKEND_HOST_PORT` selects the published
port. Check free ports with `ss -tlnp` before picking one.

Required after deploying: open inbound TCP on your chosen port in the instance's security group,
or the API is only reachable from the server itself.

> ⚠️ **No TLS in this configuration.** Without a domain you cannot get a trusted Let's Encrypt
> certificate, so the app currently sends patient data over **plain HTTP**, allowed only by an
> Android `network_security_config` exception scoped to that one server IP. This is acceptable for
> testing only. Before handling real patient data, point a domain (or a free wildcard-DNS name such
> as `<ip-with-dashes>.sslip.io`, which *does* work with certbot) at the server, terminate TLS in
> front of the backend per step 4, and delete the cleartext exception from
> `mobile/android/app/src/main/res/xml/network_security_config.xml`.

---

## 1. Launch the EC2 instance

1. In the AWS console, launch an **EC2 t4g.small** instance (Ubuntu 22.04 or 24.04, arm64 AMI —
   t4g is Graviton/ARM).
2. Create or reuse a Security Group that allows:
   - Inbound TCP 80, 443 from `0.0.0.0/0`
   - Inbound TCP 22 from **your admin IP/CIDR only** — never `0.0.0.0/0`
   - All outbound traffic
3. Attach an Elastic IP so the server's address is stable, and point your domain's DNS `A` record
   (e.g. `api.yourclinic.example`) at it.
4. SSH in as `ubuntu`.

Clinic PDF/DOCX files are stored on local disk on the server itself
(`/opt/orthocare/storage/documents`, outside the web root) — there is no S3 or other object
storage dependency. Back up that directory the same way you back up the database (see step 7).

## 2. Set up Firebase Cloud Messaging

1. Create a Firebase project (or reuse one) at https://console.firebase.google.com.
2. Add an Android app with package name matching `mobile/android/app/build.gradle`'s
   `applicationId` (`com.orthocare.app`) and download `google-services.json` — this goes into
   `mobile/android/app/` (see `docs/ANDROID.md`).
3. Under Project Settings → Service Accounts, generate a new private key (JSON). From it, take:
   - `project_id` → `FCM_PROJECT_ID`
   - `client_email` → `FCM_CLIENT_EMAIL`
   - `private_key` → `FCM_PRIVATE_KEY` (keep the `\n` escapes literal in the `.env` value, or
     base64-encode and decode at boot — check how `backend/src` loads this var and match its
     expected format)
4. Keep this JSON file out of git entirely.

## 3. Get an OpenAI API key

1. Create/use an OpenAI account with billing enabled.
2. Create an API key scoped to this project if your org supports project-scoped keys.
3. This becomes `OPENAI_API_KEY`. Model names are fixed by the app: `gpt-4.1-mini` for chat,
   `text-embedding-3-small` for embeddings — no action needed beyond the key itself.
4. Leaving `OPENAI_API_KEY` blank runs the backend in mock mode (safe for a dry run, but patients
   will only get mock/placeholder answers) — see `backend/.env.example`.

## 5A. Bare-metal path

```bash
scp infrastructure/aws/setup-ec2.sh ubuntu@<server>:~
ssh ubuntu@<server>
chmod +x setup-ec2.sh
ADMIN_SSH_CIDR=<your-ip>/32 ./setup-ec2.sh
```

This installs Node, PostgreSQL + pgvector, Nginx, PM2, locks down UFW, creates the `orthocare`
system user and `/opt/orthocare`, and prints the generated DB password + next steps. Then:

```bash
# from your machine: push the backend code to the server
rsync -av --exclude node_modules --exclude dist backend/ ubuntu@<server>:/tmp/orthocare-backend/
ssh ubuntu@<server> "sudo rsync -av /tmp/orthocare-backend/ /opt/orthocare/ && sudo chown -R orthocare:orthocare /opt/orthocare"

ssh ubuntu@<server>
sudo -u orthocare bash
cd /opt/orthocare
cp .env.example .env
# edit .env: DATABASE_URL (use the password setup-ec2.sh printed), JWT_SECRET (long random value),
# OPENAI_API_KEY, FCM_*, etc.
npm ci --omit=dev
npm run build
npm run migration:run
pm2 start dist/main.js --name orthocare-backend
pm2 save
exit  # back to ubuntu
pm2 startup systemd -u orthocare --hp /opt/orthocare   # run the printed command as root once
```

## 5B. Docker Compose path

See `infrastructure/docker/README.md` for full detail. Summary:

```bash
rsync -av infrastructure/docker/ ubuntu@<server>:~/orthocare-docker/
rsync -av backend/ ubuntu@<server>:~/orthocare-backend/   # sibling dir, referenced by compose's build context
ssh ubuntu@<server>
cd ~/orthocare-docker
cp ../orthocare-backend/.env.example .env   # fill in real values; DATABASE_URL host = `postgres`
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npm run migration:run
```

## 4. Nginx + TLS

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp infrastructure/nginx/orthocare.conf /etc/nginx/sites-available/orthocare.conf
# edit server_name to your real domain in that file first
sudo ln -s /etc/nginx/sites-available/orthocare.conf /etc/nginx/sites-enabled/orthocare.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.yourclinic.example   # issues + wires up the TLS cert automatically
```

## 5. Seed demo knowledge (optional, for testing)

```bash
npm run seed:demo    # or whatever script backend/package.json exposes — see backend/README.md
```

This loads the `DEMO_REVIEW_REQUIRED` records from `knowledge/demo/` — review and explicitly
activate them (or real clinic PDFs/DOCX) before trusting any AI answer in production, per the
spec's medical-safety rule.

## 6. Daily backups

```bash
sudo crontab -u orthocare -e
# add:
0 2 * * * APP_ENV_FILE=/opt/orthocare/.env BACKUP_RETENTION_DAYS=14 /opt/orthocare/infrastructure/aws/backup-postgres.sh >> /var/log/orthocare-backup.log 2>&1
```

Backups are written locally under `/opt/orthocare/backups`. Also periodically back up
`/opt/orthocare/storage/documents` (the clinic PDFs/DOCX) the same way — copy both off-instance
yourself if you need durability beyond a single host; neither script does that for you.

## 7. Health check

```bash
curl -I https://api.yourclinic.example/health
```

Should return `200`. Check `pm2 logs orthocare-backend` (bare-metal) or
`docker compose logs -f backend` (Docker) if not.

## 8. Point the mobile app and verify end-to-end

Update the mobile app's API base URL (see `docs/ANDROID.md`) to `https://api.yourclinic.example`,
rebuild, and run through the full flow in spec section 61 (upload a document → activate it → ask
a question as a patient → get an AI answer → say "not helpful" → confirm a nurse receives a push
notification and can resolve the case) before calling this MVP live.

## Retention reminder

`DATA_RETENTION_DAYS` (patient chat/escalation/attendance data, default 30) and
`DOCUMENT_RETENTION_DAYS` (clinic PDFs/DOCX, default far longer) are independent knobs in
`backend/.env` — do not set them to the same value without thinking about it; clinics generally
want to keep their knowledge documents much longer than patient chat logs.
