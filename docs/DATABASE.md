# OrthoCare AI — Database

PostgreSQL + the `pgvector` extension, running as a single instance (no read replicas, no separate vector DB — see section 7 of the master spec). Local dev runs it via `backend/docker-compose.yml` (`pgvector/pgvector:pg16`, bound to `127.0.0.1:5433` only). Production runs the same image's underlying engine directly on the EC2 host per `docs/DEPLOYMENT.md`.

## Where migrations actually live

The real, runnable TypeORM migrations are at `backend/src/database/migrations/` (run via `npm run migration:run`, which uses `backend/src/database/data-source.ts`). That's a deliberate deviation from the literal `database/migrations/` path in the top-level project layout: TypeORM migration files need to resolve `typeorm` and the rest of `node_modules` via Node's module resolution, which walks up from the migration file's own directory — a file living outside `backend/` wouldn't find `backend/node_modules` unless the whole repo were a single npm workspace, which would be over-engineering for an MVP. The top-level `database/migrations/` and `database/seeds/` directories instead hold:
- a copy of this note,
- the demo-knowledge seed content consumed by `backend/src/seed/seed.ts` (the actual JSON lives in `knowledge/demo/demo-knowledge-pack.json`, per the project layout in section 64).

## Entity-relationship summary

```
users (role: admin|doctor|nurse|patient)
  ├─ doctors (1:1 via user_id)
  │    └─ patients.doctor_id (many patients per doctor)
  ├─ nurses (1:1 via user_id)
  │    ├─ shifts (many per nurse)
  │    └─ attendance (many per nurse; at most one open row — punch_out IS NULL — at a time,
  │                    enforced by a partial unique index)
  └─ patients (1:1 via user_id)
       ├─ chat_sessions (many)
       │    └─ chat_messages (many; role patient|assistant)
       └─ escalations (many)
            ├─ assigned_nurse_id → nurses
            ├─ chat_session_id / chat_message_id → chat_sessions / chat_messages (nullable,
            │   ON DELETE SET NULL — the escalation survives even if the chat row is later
            │   purged by retention cleanup)
            └─ nurse_case_notes (many; the nurse's contact/resolution record)

documents (logical document, e.g. "Knee Replacement Guideline")
  └─ document_versions (v1, v2, ... - exactly one is "current" via documents.current_version_id)
       └─ knowledge_chunks (the actual retrievable units; embedding vector(1536))

notifications.related_escalation_id → escalations (nullable)
audit_logs (append-only; metadata jsonb, never raw patient message text)
red_flag_rules (doctor-approved keyword/symptom → priority rules)
```

All primary keys are `uuid` (`uuid_generate_v4()`, via the `uuid-ossp` extension).

## Status enums shared across the knowledge pipeline

`document_status_enum` is used by **both** `documents.status`, `document_versions.status`, and `knowledge_chunks.status` (all three move together): `UPLOADED → PROCESSING → READY_FOR_REVIEW → ACTIVE | FAILED | ARCHIVED`, plus `DEMO_REVIEW_REQUIRED` (seed data landing state) and `OCR_REQUIRED` (scanned/image-only PDF detected, section 13). Retrieval (`KnowledgeService.retrieveRelevantChunks`) hard-filters to `status = 'ACTIVE'` only — nothing else is ever reachable by the chatbot, regardless of similarity score.

## `knowledge_chunks` — the RAG table

```sql
CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  document_version varchar NOT NULL,      -- denormalized label, e.g. "v2"
  file_name varchar NOT NULL,
  page_number integer,                     -- set for PDF-derived chunks
  section_title varchar,                   -- set for DOCX-derived chunks (heading text)
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536),                  -- text-embedding-3-small dimension
  status document_status_enum NOT NULL DEFAULT 'UPLOADED',
  surgery_type varchar,
  category varchar,
  recovery_phase varchar,
  language varchar NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_chunks_embedding_hnsw
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
```

1536 is hard-coded because it's the fixed output dimension of `text-embedding-3-small` (and of the mock embedding fallback, for schema consistency) — see `docs/RAG.md` for why the dimension must never silently drift.

## Why `embedding` isn't a TypeORM-mapped column

TypeORM has no first-class `vector` column type. `KnowledgeChunk` (the entity) intentionally does **not** declare `embedding` as a mapped `@Column` — every read/write of it goes through raw, parameterized SQL in `KnowledgeService` (`... $1::vector ...`), which sidesteps ORM type-coercion entirely rather than fighting it. See `docs/RAG.md` for the full rationale and the exact queries.

## Retention (sections 47–48)

Two independent policies, both configurable via env vars, enforced by `RetentionService` (`@Cron('0 3 * * *')`, also callable directly for tests/manual runs):

- **Patient operational data** (`DATA_RETENTION_DAYS`, default 30): chat sessions+messages (only `status='CLOSED'` sessions past the cutoff — an `OPEN` session is never touched), escalations (only `status='RESOLVED'` past the cutoff — `WAITING_FOR_NURSE`/`ASSIGNED`/`CONTACTED`/`ESCALATED_TO_DOCTOR` are never purged), notifications, and closed-out attendance rows (`punch_out IS NOT NULL`).
- **Clinic knowledge** (`DOCUMENT_RETENTION_DAYS`, default 3650 / 10 years): informational only — nothing in this codebase auto-deletes `documents`/`document_versions`/`knowledge_chunks`. The clinic's own documents are the production source of truth and are never deleted by a scheduled job; that value exists for backup/ops policy, not application logic.
- `audit_logs` are never purged by this job (compliance trail).

## Seed data

`backend/src/seed/seed.ts` (`npm run seed:demo`) creates four demo accounts (admin/doctor/nurse/patient — the nurse gets an always-active `00:00`–`23:59` shift for easy manual testing) and loads the 5 demo orthopedic knowledge records from `knowledge/demo/demo-knowledge-pack.json` with `status = 'DEMO_REVIEW_REQUIRED'`. They are never auto-activated — see `docs/API.md`'s `approve-demo` endpoint.
