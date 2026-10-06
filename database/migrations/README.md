# Migrations

The real, runnable TypeORM migrations live at `../../backend/src/database/migrations/` and run via `npm run migration:run` from `backend/`. See `../../docs/DATABASE.md` ("Where migrations actually live") for why they aren't physically in this directory: a migration file here can't resolve `node_modules` (TypeORM, etc.) without making the whole repo a single npm workspace, which is unnecessary for this MVP.
