# OrthoCare AI

**AI Support. Human Care. Better Recovery.**

A single-clinic orthopedic patient support system: a doctor-approved knowledge base (built from
clinic PDF/DOCX documents via RAG over PostgreSQL + pgvector) answers routine post-operative
patient questions through an AI chatbot (GPT-4.1 mini), and automatically escalates anything it
can't confidently answer — or that the patient marks unhelpful — to the currently on-duty nurse,
with push notification, response tracking, and resolution recording. Nurse attendance/shift
management and a role-gated admin/doctor dashboard are part of the same system.

## Architecture at a glance

```
Patient (Flutter app)
   -> AI Chat -> Backend (NestJS) -> pgvector similarity search over approved clinic chunks
             -> GPT-4.1 mini answers ONLY from retrieved chunks (never invents medical info)
             -> if unsupported / patient says "not helpful" -> Escalation created
             -> currently active (punched-in, on-shift) Nurse is found and notified via FCM
Nurse (same Flutter app, nurse role)
   -> sees case, calls patient, records resolution
Admin/Doctor (same Flutter app, admin/doctor role)
   -> uploads clinic PDFs/DOCX -> ingestion pipeline (extract -> chunk -> embed -> pgvector)
   -> reviews/activates documents and demo knowledge, manages nurses/shifts, views dashboard
```

The AI is explicitly **not a doctor**: it only answers from doctor-approved, ACTIVE knowledge
chunks retrieved via pgvector similarity search, and safely escalates to a human whenever
confident, approved knowledge isn't found — see `docs/RAG.md` for the full pipeline and safety
rules.

## Repo layout

```
orthocare/  (this repo — currently at D:\VadayAI Solutions\CareOrtho)
├── mobile/            Flutter app — patient, nurse, AND admin/doctor roles in one codebase
├── backend/           NestJS backend — REST API, RAG pipeline, escalation, notifications
├── database/          SQL migrations and seed scripts
├── knowledge/demo/    Demo orthopedic knowledge pack (DEMO_REVIEW_REQUIRED, not auto-active)
├── infrastructure/
│   ├── aws/           EC2 bootstrap and Postgres backup scripts
│   ├── nginx/          Reverse proxy + TLS config
│   └── docker/         Alternative Docker Compose production deployment
└── docs/
    ├── API.md          REST endpoint reference
    ├── DATABASE.md      Schema reference
    ├── RAG.md           Retrieval/ingestion pipeline + medical-safety rules
    ├── DEPLOYMENT.md     AWS deployment runbook
    └── ANDROID.md        Flutter/Android build + signing guide
```

There is intentionally **no separate web admin app** — the admin/doctor screens (dashboard, nurse
management, shift management, attendance, escalations, document knowledge base) are additional
role-gated screens inside the same Flutter app that patients and nurses use.

## Current status (honest, as of this build pass)

This was built in a dev environment with **no AWS account, no Firebase/OpenAI credentials, no
Android SDK/Java, and no Flutter SDK installed** — so some of what follows was written and
reasoned through carefully but not executed end-to-end here. Check `backend/README.md` and
`mobile/README.md` for the most current, specific status of each piece as they were built out in
parallel with this document.

- **Backend (NestJS + PostgreSQL/pgvector)** — implemented against the full spec (auth, roles,
  attendance, shifts, document ingestion, chunking, embeddings, RAG retrieval, GPT-4.1 mini chat,
  escalation + active-nurse assignment, FCM, dashboard/reports, audit log, 30-day retention
  cleanup). Runs locally today via Docker Compose (`backend/docker-compose.yml` brings up
  Postgres+pgvector) even without real OpenAI/AWS/FCM credentials, since those integrations fall
  back to a documented mock mode when their env vars are blank — see `backend/.env.example` and
  `backend/README.md` for how to run it and what's mocked vs. real.
- **Mobile app (Flutter)** — source written for all three roles (patient, nurse, admin/doctor),
  but **not yet compiled**: this environment has no Flutter SDK. The first thing to do with it is
  `cd mobile && flutter pub get && flutter analyze` and fix whatever that surfaces — see
  `mobile/README.md` for the specific risk areas flagged during the build-out.
- **Infrastructure / deployment** (this piece) — EC2 bootstrap script, Postgres backup script,
  Nginx+TLS config, and an alternative Docker Compose production stack are all written and ready
  to run, but **were not executed against a real AWS account** — none exists in this environment.
  `docs/DEPLOYMENT.md` is the literal runbook for a human with AWS credentials to follow. There is
  no S3/object-storage dependency anywhere — clinic PDFs/DOCX are stored on local disk on the
  server (`backend/storage/documents`), backed up the same way as the database.
- **Demo knowledge pack** (`knowledge/demo/`) — seeded as `DEMO_REVIEW_REQUIRED`, per the spec's
  safety rule that nothing becomes clinic-approved (`ACTIVE`) without an explicit doctor review
  step, even demo/test content.

## What a human needs to do to reach a live MVP

1. **Get credentials**: an OpenAI API key, an AWS account (for EC2 only — no S3 is used), and a
   Firebase project (for FCM). None of these exist in this dev environment.
2. **Install local tooling**: Flutter SDK + Android SDK/Java, to compile, analyze, and build the
   mobile app (`docs/ANDROID.md`).
3. **Run the backend locally first**: `cd backend && docker compose up -d && npm install && npm run migration:run && npm run start:dev` (confirm exact scripts in `backend/README.md`) — this works today without any of the external credentials, in mock mode.
4. **Deploy to AWS**: follow `docs/DEPLOYMENT.md` top to bottom once you have real credentials.
5. **Build and sign the Android app**, point it at the deployed backend, and run the full
   end-to-end flow from spec section 61 (upload a document → activate it → ask a question as a
   patient → get an AI answer → mark "not helpful" → confirm the on-duty nurse gets notified and
   can resolve the case) before calling it live.

## Explicitly out of scope (by design, not an oversight)

Kubernetes, microservices, Redis, Pinecone/Weaviate/Elasticsearch, WhatsApp/SMS, voice/video
calls, payments/subscriptions, multi-clinic SaaS, complex analytics, AI diagnosis, and automatic
medication-dosage changes. This is a single-clinic MVP; keep it that way unless there's a real
reason to grow it.
