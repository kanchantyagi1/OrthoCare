# OrthoCare AI — RAG Pipeline

## Pipeline (section 20)

```
Patient question
  → ChatService.sendMessage()
  → AiProviderService.embed(question)                [text-embedding-3-small, or mock]
  → KnowledgeService.retrieveRelevantChunks()         [pgvector cosine search, status=ACTIVE only]
  → RedFlagRulesService.matchPriority(question)       [doctor-approved keyword match, independent of the LLM]
  → AiProviderService.answerQuestion()                [GPT-4.1-mini with the section-23 system prompt, or mock]
  → merge: red-flag priority can only ever escalate, never override a "supported" answer into a false one
  → persist ChatMessage (confidence, needsHuman, priority, sourceChunkIds, similarityScores, model)
  → if needsHuman: EscalationsService.create()
```

The LLM never sees the whole document or the whole knowledge base — only the top-K retrieved chunks (`RAG_TOP_K`, default 5) that cleared the similarity threshold, plus the last few conversation turns (section 56).

## Why the `embedding` column bypasses the ORM

TypeORM has no built-in `vector` column type. Rather than fighting it with a `varchar`-typed column and hoping node-postgres's implicit parameter-type coercion does the right thing on every query (insert, update, `ORDER BY embedding <=> $1`), `KnowledgeChunk` simply doesn't declare `embedding` as an ORM-mapped field at all. The physical column (`vector(1536)`, created directly in the migration SQL) is written and read exclusively through raw, parameterized queries in `KnowledgeService`:

```ts
await this.dataSource.query(
  `INSERT INTO knowledge_chunks (..., embedding, ...) VALUES (..., $10::vector, ...)`,
  [..., toVectorLiteral(embedding), ...],
);
```

```ts
await this.dataSource.query(
  `SELECT id, chunk_text, ..., 1 - (embedding <=> $1::vector) AS similarity
   FROM knowledge_chunks
   WHERE status = 'ACTIVE' ...
   ORDER BY embedding <=> $1::vector
   LIMIT $2`,
  [vectorLiteral, topK],
);
```

`toVectorLiteral` just renders a JS `number[]` as `"[0.1,0.2,...]"`, which pgvector's input function parses directly when cast with `::vector`. This is a one-line helper, not a library, and it's the standard pattern used across the Node ecosystem wherever an ORM doesn't have native pgvector support.

## Retrieval filtering and thresholding (sections 21–22)

- Hard filter: `status = 'ACTIVE'` — `ARCHIVED`, `FAILED`, `DEMO_REVIEW_REQUIRED`, `READY_FOR_REVIEW` chunks are never retrievable, full stop, regardless of similarity.
- Optional filter: if the patient's `surgeryType` is known, the SQL adds `AND (surgery_type IS NULL OR surgery_type = $3)` — chunks without a surgery type are treated as general-purpose and always eligible.
- Similarity threshold: rows are computed and ranked in SQL (`ORDER BY embedding <=> $1::vector LIMIT topK`), then filtered in JS against `RAG_SIMILARITY_THRESHOLD`. Anything below threshold is dropped rather than forced into context — if that leaves zero chunks, the AI call still happens but with empty context, and the system prompt instructs it to say so (`insufficient_context`) rather than guess.

### The threshold is mock-mode-aware

`configuration.ts` auto-selects a default, but an explicitly set `RAG_SIMILARITY_THRESHOLD` env var always wins:
- **0.72** when a real `OPENAI_API_KEY` is configured.
- **0.25** when running in mock mode (no API key) — the mock embedding (below) is a crude bag-of-words hash whose cosine similarities for a short query against a longer, genuinely relevant passage typically land around 0.25–0.4, nowhere near what a real embedding model produces. Using the production threshold in mock mode would make the chatbot escalate on *every* question, which defeats the point of having a mock mode for local development and demos.

### ⚠️ The 0.72 real-embedding default is too strict — measured, not theorised

When the deployment first switched to a real `OPENAI_API_KEY`, **every** question escalated with
`insufficient_context` and zero retrieved chunks. The retrieval wasn't broken; 0.72 was simply
unreachable. Measured cosine similarities against the demo pack with real `text-embedding-3-small`
vectors, for *"Can I walk after knee replacement surgery?"*:

```
0.600  0.559  0.466  0.427  0.322
```

Clearly on-topic chunks land roughly **0.47–0.67**; the irrelevant tail sits below ~0.43. Nothing
came close to 0.72. The deployment therefore pins `RAG_SIMILARITY_THRESHOLD=0.45`, which was then
verified both ways: an on-topic question ("When can I start exercise after my surgery?") returned
`supported` with real sources, while a medication-dosage question with no approved knowledge still
returned `insufficient_context` and escalated — i.e. lowering the threshold did **not** weaken the
medical-safety property.

Re-tune after real clinic PDFs replace the demo pack: longer and more varied documents shift the
distribution. The failure modes in each direction are asymmetric and worth naming — too **high**
and the assistant escalates everything (annoying, and it buries nurses in avoidable tickets); too
**low** and it answers from loosely-related passages, which in a medical app is a safety risk. When
in doubt, prefer the escalation.

## Mock mode (no OPENAI_API_KEY)

`AiProviderService` and the embedding call never make a network request when `OPENAI_API_KEY` is unset/blank/a placeholder (`isPlaceholder()` in `configuration.ts`):

- **Embeddings** (`mock-embedding.util.ts`): a deterministic, dependency-free bag-of-words hash into 1536 dimensions, L2-normalized. Same text always produces the same vector; two texts sharing more words produce a higher cosine similarity than two that don't — enough to exercise the full retrieval/threshold/escalation pipeline in tests and local dev, but **not** a semantic embedding. It will not understand synonyms, word order, or paraphrasing the way a real embedding model does.
- **Chat completion**: echoes the single best-matching retrieved chunk verbatim with `confidence: supported`, or returns the exact safe-escalation message with `confidence: insufficient_context` if nothing was retrieved — i.e. the mock obeys the same "never invent, only use supplied context" rule as the real prompt, it just doesn't call an LLM to phrase the answer.

This means: **never insert a fake/placeholder API key to "test the real path."** The mock mode already exercises every branch of the pipeline deterministically; a fake key would either fail a real network call (slow, confusing errors) or, if accidentally valid, make real billed API calls. Flipping `openai.mockMode` to `false` happens automatically and only when a real-looking key is present — verified by code inspection in `configuration.ts`'s `isPlaceholder()` and `AiProviderService`'s constructor, not by testing it live.

## Chunking (section 16) and why PDF vs DOCX differ

`backend/src/modules/documents/chunking/chunker.ts` has two entry points:

- **`chunkDocxBlocks`** — true section-aware chunking. DOCX extraction (`extraction/docx-extractor.ts`, via `mammoth` + `cheerio`) gives real heading/paragraph/table structure, so each heading becomes the `sectionTitle` carried by every chunk until the next heading; paragraphs accumulate up to ~900 characters before being flushed as a chunk, and a single paragraph longer than that is split only at sentence boundaries (`splitBySentence`), never mid-sentence.
- **`chunkPdfPages`** — page-preserving, not section-aware. PDF text extraction has no reliable heading markup to key off of (see below), so PDF chunks carry `pageNumber` (always) but not `sectionTitle`. Each page's text is split at sentence boundaries into ~900-character pieces; tiny trailing fragments get merged into the previous chunk from the same page rather than becoming their own near-empty chunk.

This asymmetry is a real, documented limitation, not an oversight: building real heading detection out of raw PDF text (which has no structural markup, just positioned glyphs) would require font-size/position heuristics well beyond this MVP's scope. The "clinic provides PDF/DOCX" spec explicitly allows this — DOCX gets full section-aware treatment, PDF gets page-accurate (per section 10's requirement to "preserve page numbers").

## PDF extraction: `pdfjs-dist` directly, not `pdf-parse`

The original implementation used the `pdf-parse` npm package. It intermittently failed with errors like `Illegal character: 41` and `bad XRef entry` on the *exact same, valid, byte-identical PDF file* — reliably on the first call in a fresh process, unreliably (different error each time) on the second and subsequent calls within the same long-running Node process. Root cause: `pdf-parse` wraps a years-old, no-longer-updated vendored copy of pdf.js behind a module-level singleton (`let PDFJS = null`) that is not safely reusable across repeated documents in one process — exactly the production scenario (a server handling many uploads over its lifetime).

The fix was to drop `pdf-parse` entirely and call `pdfjs-dist` (the actively maintained official package) directly via its legacy Node build, verified via a repeated-call-in-one-process test before being wired into `DocumentsService`. One wrinkle: `pdfjs-dist` v4 ships ESM-only (`.mjs`); this project compiles to CommonJS, and TypeScript's default downlevel of a dynamic `import()` under `module: commonjs` is `require()`, which cannot load an ESM module (`ERR_REQUIRE_ESM`). `pdf-extractor.ts` builds the `import()` call via `new Function('specifier', 'return import(specifier)')`, which hides it from tsc's static transform so Node's real dynamic `import()` runs at runtime instead — a standard, documented workaround for CJS-importing-ESM, not a hack specific to this bug.

## OCR_REQUIRED detection (section 13)

Both extractors compute `avgCharsPerPage = fullText.trim().length / numPages` (PDF) or just `fullText.trim().length` (DOCX, single "page") and flag `ocrRequired: true` below a small threshold (30 chars/page). A flagged version is marked `OCR_REQUIRED` and processing stops there — no chunks, no embeddings are created from a scanned/image-only document. OCR itself is out of scope for this MVP (explicitly deferred in section 13).

## Structured AI response (section 25)

`AiProviderService.answerQuestion()` always returns:
```ts
{ answer, confidence: 'supported'|'insufficient_context', needsHuman: boolean,
  priority: 'normal'|'high'|'urgent', reason: string, sourceChunkIds: string[] }
```
In real mode this is enforced by requesting `response_format: { type: 'json_object' }` from the Chat Completions API and validating/clamping every field against the enum before use (an unexpected `priority` value falls back to `normal`, an unexpected `confidence` falls back to `insufficient_context` — fail closed, never fail open into an unsafe default).
