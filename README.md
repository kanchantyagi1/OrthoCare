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

## Current status (honest)

- **Backend (NestJS + PostgreSQL/pgvector)** — implemented against the full spec (auth, roles,
  attendance, shifts, document ingestion, chunking, embeddings, RAG retrieval, GPT-4.1 mini chat,
  escalation + active-nurse assignment, FCM, dashboard/reports, audit log, 30-day retention
  cleanup). **36/36 unit tests pass**, and the full spec-section-61 flow was smoke-tested against a
  real Postgres+pgvector (upload → extract → chunk → embed → activate → patient question → AI
  answer with recorded source chunks → "not helpful" → escalation → on-duty nurse assignment →
  mock FCM → resolution).
- **Backend is DEPLOYED and live** on an EC2 `t4g.small` (`wahflow-server`), running as Docker
  containers alongside an unrelated pre-existing stack on the same host without interfering with
  it (own Compose project name, own network/volumes, own port). `GET /health` returns
  `{"status":"ok"}`, migrations are applied, and demo accounts + the demo knowledge pack are
  seeded. It currently answers on `http://<server-ip>:8081`.
- **Mobile app (Flutter)** — all 18 screens across all three roles (patient, nurse, admin/doctor).
  `flutter pub get` and `flutter analyze` are **clean (0 errors)**, verified by running Flutter
  3.44.0. The release APK/AAB is built in CI (`.github/workflows/mobile-build.yml`) — see
  `mobile/README.md` for where to download the artifacts.
- **Infrastructure** — EC2 bootstrap script, Postgres backup script, Nginx+TLS config and a
  production Docker Compose stack. The Docker Compose path is the one actually used for the live
  deployment. There is no S3/object-storage dependency anywhere — clinic PDFs/DOCX are stored on
  local disk on the server (`storage/documents`), backed up the same way as the database.
- **Demo knowledge pack** (`knowledge/demo/`) — seeded as `DEMO_REVIEW_REQUIRED`, per the spec's
  safety rule that nothing becomes clinic-approved (`ACTIVE`) without an explicit doctor review
  step, even demo/test content.

### Known gaps / what still needs a human

1. **Open the API port in the EC2 security group** — inbound TCP `8081` from `0.0.0.0/0`. Until
   this is done the backend is only reachable from the server itself, not from a phone.
2. **No TLS yet.** The app talks to the backend over plain HTTP on an IP (there is no domain), and
   an Android `network_security_config` scoped to that single IP permits it. **This is a stopgap
   for testing, not acceptable for real patient data** — put a domain + TLS cert in front of the
   backend (see `docs/DEPLOYMENT.md`) and delete that cleartext exception before going live.
3. **OpenAI key**: set `OPENAI_API_KEY` in the server's `.env` and restart the backend container.
   Until then the AI answers come from a deterministic mock, not GPT-4.1 mini.
4. **Firebase/FCM is unconfigured**, so push notifications are recorded and logged but not
   delivered. Needs a Firebase project + `google-services.json` (app) and `FCM_*` vars (backend).
5. **No widget/integration tests** for the Flutter app, and the end-to-end flow has not been
   exercised from a real device yet.
6. **Resource headroom**: the shared `t4g.small` has ~1.8 GB RAM total for both stacks. Watch for
   memory pressure, or move OrthoCare to its own instance.

## Explicitly out of scope (by design, not an oversight)

Kubernetes, microservices, Redis, Pinecone/Weaviate/Elasticsearch, WhatsApp/SMS, voice/video
calls, payments/subscriptions, multi-clinic SaaS, complex analytics, AI diagnosis, and automatic
medication-dosage changes. This is a single-clinic MVP; keep it that way unless there's a real
reason to grow it.
