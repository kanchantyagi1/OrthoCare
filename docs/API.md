# OrthoCare AI — Backend API Reference

Base URL: `http://<host>:<port>/api` (all routes are prefixed with `/api`; `PORT` defaults to `3001` in `.env.example` to avoid clashing with other local services).

All endpoints except `POST /auth/login` and `GET /health` require `Authorization: Bearer <JWT>`. Roles: `admin`, `doctor`, `nurse`, `patient`.

## Auth

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` → `{ accessToken, user }`. Rate-limited (5/min). |
| POST | `/auth/logout` | any authenticated | Records an audit log entry. |

## Attendance (nurse)

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/attendance/punch-in` | nurse | `{ shiftId?, deviceId? }`. Idempotent — a second punch-in while already open returns the existing record with `duplicate: true` instead of creating a second row (also enforced at the DB level by a partial unique index on `attendance(nurse_id) WHERE punch_out IS NULL`). |
| POST | `/attendance/punch-out` | nurse | `{ deviceId? }`. Idempotent the same way. |
| GET | `/attendance/today` | nurse | Returns `{ status: 'ACTIVE'|'OFFLINE', records }` for the caller. |

## Shifts

| Method | Path | Roles |
|---|---|---|
| GET | `/shifts` | any authenticated |
| POST | `/shifts` | admin, doctor |
| PUT | `/shifts/:id` | admin, doctor |
| DELETE | `/shifts/:id` | admin, doctor |

Shift `startTime`/`endTime` are `"HH:mm"` strings (24h, clinic-local time). Overnight shifts (e.g. `22:00`–`06:00`) are supported.

## Knowledge documents (admin/doctor)

| Method | Path | Notes |
|---|---|---|
| GET | `/knowledge/documents` | List all documents. |
| GET | `/knowledge/documents/:id` | Document + all of its versions. |
| POST | `/knowledge/documents` | `multipart/form-data`: `file` (PDF or DOCX) + `title`, `surgeryType?`, `category?`. Upload triggers processing (extract → chunk → embed) synchronously in the request; the response is the created `DocumentVersion` with its resulting `status`. |
| POST | `/knowledge/documents/:versionId/process` | Re-run processing for a specific version (normally automatic on upload). |
| POST | `/knowledge/documents/:versionId/reprocess` | Archives existing chunks for that version and re-extracts/re-chunks/re-embeds from the stored file. |
| POST | `/knowledge/documents/:id/approve-demo` | Demo-data workflow only (section 41): moves a `DEMO_REVIEW_REQUIRED` document to `READY_FOR_REVIEW`, i.e. "doctor reviewed it." Must still be activated afterward — demo content is never auto-activated. |
| POST | `/knowledge/documents/:id/activate` | Body `{ versionId? }` (defaults to the newest `READY_FOR_REVIEW` version). Makes that version `ACTIVE` and retrievable by the chatbot; archives whichever version was previously active (and its chunks), without deleting it. |
| POST | `/knowledge/documents/:id/archive` | Archives the document's current active version. |
| DELETE | `/knowledge/documents/:id` | Soft-delete: archives the document rather than hard-deleting it, so existing chat messages keep valid source references for audit (section 15). |

### Document status lifecycle

`UPLOADED → PROCESSING → READY_FOR_REVIEW → ACTIVE` (happy path), with `FAILED` or `OCR_REQUIRED` possible after `PROCESSING`, and `ARCHIVED` reachable from `ACTIVE`. Seed/demo records start at `DEMO_REVIEW_REQUIRED` instead of `UPLOADED` and must pass through `approve-demo` before they can ever be activated. Only `ACTIVE` chunks are ever retrieved by the chatbot (section 21).

## Red-flag rules (admin/doctor)

| Method | Path | Notes |
|---|---|---|
| GET | `/red-flag-rules` | List rules. |
| POST | `/red-flag-rules` | `{ name, description?, keywords: string[], symptoms: string[], priority, doctorId?, status }`. |
| PUT | `/red-flag-rules/:id` | Update a rule. |

Only rules with `status: 'ACTIVE'` are ever matched against patient messages (section 35) — the LLM cannot invent its own red-flag logic.

## Chat (patient)

| Method | Path | Notes |
|---|---|---|
| POST | `/chat/session` | Starts a new chat session for the calling patient. |
| POST | `/chat/message` | `{ sessionId, message }`. Runs the full RAG pipeline (see `RAG.md`) and returns `{ patientMessage, assistantMessage, duplicate }`. If the AI determines `needsHuman: true` (either because no approved knowledge supports an answer, or a red-flag keyword matched), an escalation is created automatically — the patient does not have to tap "No" first. |
| POST | `/chat/message/:id/feedback` | `{ helpful: boolean }`. A `false` always results in an escalation (creating one if the message hadn't already triggered one). |
| GET | `/chat/history` | All of the calling patient's sessions + messages. |

## Escalations

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/escalations` | patient | Manual escalation (e.g. "talk to a nurse" button outside of a specific AI answer). `{ chatSessionId?, chatMessageId?, question, aiResponse?, reason? }`. |
| GET | `/escalations` | nurse, admin, doctor | A nurse sees only escalations assigned to them; admin/doctor see all. Optional `?status=`. |
| GET | `/escalations/:id` | nurse, admin, doctor | |
| POST | `/escalations/:id/contact` | nurse | Marks `CONTACTED`, records `contactedAt` (used for first-response-time metrics). |
| POST | `/escalations/:id/resolve` | nurse | `{ patientContacted, issueCategory?, resolution?, followUpRequired?, escalateToDoctor?, notes? }`. Creates a `NurseCaseNote` and sets status to `RESOLVED` or `ESCALATED_TO_DOCTOR`. |
| POST | `/escalations/:id/escalate-doctor` | nurse | Shortcut to flag doctor escalation without going through the full resolve form. |

### Active-nurse assignment (section 28)

On creation, every escalation calls `AttendanceService.getCurrentAvailableNurse()`, which finds a nurse who (1) has an active (`is_active=true`) shift definition, (2) that shift's `HH:mm` window contains the current time, (3) has an open attendance row (punched in, not punched out), and (4) whose nurse profile is active. If found, the escalation becomes `ASSIGNED` and the nurse is pushed an FCM notification (urgent vs normal template, section 36). If not, it stays `WAITING_FOR_NURSE` and all admins are notified instead.

## Dashboard / reports (admin/doctor)

| Method | Path |
|---|---|
| GET | `/dashboard` | Cards: active nurses, today's patient chats, AI-resolved count, human escalations, pending, urgent + a nurse-performance table (assigned/resolved/pending/avg response time). |
| GET | `/reports/attendance` | Today's attendance records. |
| GET | `/reports/escalations` | Totals by status + average first-response and resolution times. |
| GET | `/reports/ai` | AI response counts by confidence + how many needed human escalation. |

## Nurses / Doctors / Patients (admin/doctor management)

Standard CRUD-ish endpoints (`GET/POST /nurses`, `GET/POST /doctors`, `GET/POST /patients`, plus `GET /patients/me` for the patient's own profile) used by the admin dashboard to provision accounts. Passwords are hashed with bcrypt server-side; plaintext passwords are only ever accepted over HTTPS in transit, never stored.

## Error handling

- OpenAI failures never bubble raw API errors to the client — the patient sees "We're temporarily unable to answer this question. Please contact the clinic team." (section 57) and the attempt is logged.
- FCM failures never fail the escalation request — delivery failures are recorded on the `Notification` row (`status: 'FAILED'`, `failureReason`) and logged, but the HTTP response still succeeds.
- Document processing failures set the version/document to `FAILED` with a `failureReason` rather than throwing out of the upload request.
