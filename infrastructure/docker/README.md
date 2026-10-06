# Docker Compose deployment (production)

This is an **alternative** to the bare-metal `infrastructure/aws/setup-ec2.sh` path — pick one, not both.

## Bare-metal (`setup-ec2.sh`) vs Docker Compose — which to use

| | Bare-metal (`setup-ec2.sh`) | Docker Compose (this folder) |
|---|---|---|
| Best when | You want the simplest possible single-EC2 MVP, minimal moving parts, easiest `pg_dump`/`psql` debugging | You're already comfortable with Docker, want backend deploys to be a single `docker compose up -d --build`, or plan to move off a single EC2 box later |
| PostgreSQL | Installed directly on the host via apt + pgvector built from source | Runs as the official `pgvector/pgvector:pg16` container |
| Backend | Runs under PM2/systemd, `npm run build` + `pm2 start dist/main.js` | Runs as a container built from `backend/Dockerfile` |
| Upgrades | `git pull && npm ci && npm run build && pm2 reload` | `git pull && docker compose up -d --build` |

Both approaches still put **Nginx on the host** terminating TLS (see `infrastructure/nginx/orthocare.conf`) and proxying to `127.0.0.1:3000`.

## Usage

```bash
cd infrastructure/docker
cp ../../backend/.env.example .env
# edit .env with real production values (DATABASE_URL should point at the `postgres` service,
# e.g. postgres://orthocare:<password>@postgres:5432/orthocare — NOT localhost)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend
```

## Dependency: `backend/Dockerfile`

This compose file builds the backend from `backend/Dockerfile`. If that file doesn't exist yet in
your checkout, add a standard multi-stage Node 20 Dockerfile there (install deps, `npm run build`,
copy `dist/` + `node_modules` into a slim runtime image, `CMD ["node", "dist/main.js"]`,
`EXPOSE 3000`). The compose file assumes the container listens on port 3000 and writes uploaded
documents under `/app/storage` (mapped to the `orthocare_uploads` named volume).

## Migrations

Run database migrations against the containerized Postgres the same way you would locally, just
pointing at the exposed port or executing inside the container, e.g.:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run migration:run
```

## Backups

`infrastructure/aws/backup-postgres.sh` expects a local `pg_dump`/`psql` and a `DATABASE_URL`. When
Postgres runs in a container, either run the backup script *inside* the `postgres` container
(mount it in, or `docker compose exec postgres pg_dump ...`) or install the `postgresql-client`
package on the host and point `DATABASE_URL` at `127.0.0.1:<published-port>` if you choose to
publish the Postgres port to the host for this purpose (not published by default — see the
compose file's comment on why).
