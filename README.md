# ShopSphere Support

A React customer-support application backed by an Express RAG API, Gemini and Pinecone.

## Architecture

```text
React → Express API → ChatbotService → Gemini query embedding
                                    → Pinecone (top 4, metadata.text)
                                    → original context/system prompt
                                    → Gemini answer → React

knowledge/*.pdf → PDF.js page extraction → ~300-token chunks
               → Gemini document embeddings → Pinecone upsert
```

Each request is independent. Messages exist only in React memory until the conversation is cleared or the page is reloaded. Previous messages are never sent to Gemini. There is no streaming, account system or generated citation feature.

```text
client/
  src/components/    Sidebar, header, welcome, messages, composer
  src/hooks/         Chat lifecycle and theme preference
  src/services/      API requests, timeouts and response validation
  src/pages/         Chat page
src/                 CommonJS Express backend (retained location)
  config/            Environment parsing and validation
  controllers/       Query validation and HTTP response handling
  routes/            Versioned API routes
  services/          Existing RAG orchestration and PDF processing
  integrations/      Gemini and Pinecone SDK adapters
  middleware/        Safe error responses
  utils/             Logging, validation and application errors
knowledge/           Five original PDFs, unchanged
public/index.html    Original client, preserved but not served
tests/               Credential-free backend and PDF regression tests
```

## Requirements

- Node.js **22.12+** (Node 24 LTS also supported), npm 9+.
- A Gemini API key with access to the configured answer and embedding models.
- A Pinecone API key and an existing dense-vector index containing embeddings from the **same Gemini model and dimensionality**. The default is 1024 dimensions and namespace `policies`.

## Install and configure

```bash
npm install
cp .env.example .env
```

If `.env` already exists, update it rather than overwriting your credentials. A single root install includes the React workspace.

Set these server-only values in the root `.env`:

```dotenv
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=1024
PINECONE_API_KEY=your-key
PINECONE_INDEX=your-gemini-index
PINECONE_NAMESPACE=policies
INGEST_ON_STARTUP=false
```

Model identifiers are configurable; select models enabled for your account. `CLIENT_ORIGINS` is a comma-separated list of exact permitted HTTP(S) origins, without trailing slashes. Set your real frontend origin in production. `VITE_API_URL` can remain empty for Vite's development proxy and same-origin production hosting. For a separately hosted frontend, set it to the backend origin **before building**, and allow the frontend origin through `CLIENT_ORIGINS`. Never place secrets in a `VITE_` variable: those values are included in the browser bundle.

See `.env.example` for ports, timeouts, rate limits and an optional knowledge-directory override. Server environment changes require a restart; Vite variables require a restart or rebuild. `.env` is ignored by Git.

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Express runs on port 8080 by default; Vite proxies `/api` to that port. The API validates credentials and reads the Pinecone index description before listening. Startup fails with a useful error if the index dimension cannot be verified or differs from the configured dimension. This check never changes the index.

The interface supports light/dark themes, mobile navigation, clickable topic questions, Markdown including tables and code, timestamps, copy, regeneration, retry and clearing the conversation. Enter sends; Shift+Enter inserts a line. Sending is disabled during a request. Clearing cancels the browser request and discards late responses. Theme preference alone is saved locally. The knowledge-base list describes the bundled policies, not per-answer citations.

## Ingestion and migration safety

The safe default is **`INGEST_ON_STARTUP=false`**. Starting the server performs no Pinecone writes. After selecting a compatible Gemini index, explicitly run:

```bash
npm run ingest
```

This checks index dimensions before PDF processing, reads every PDF page using the CommonJS PDF.js build, creates approximately 300-token chunks with the original splitter, embeds in batches and upserts to the configured namespace. Chunk text remains in the `text` metadata field, with filename, page and source metadata. The original prompt is preserved byte-for-byte, including `COMPANMY INFORMATION`.

**OpenAI and Google embeddings are incompatible even if their dimensions match.** A dimension check cannot identify which model produced existing vectors. Point the application at a separate index/namespace dedicated to the configured Gemini embedding model, then ingest the PDFs there. Do not reuse an OpenAI-populated namespace. Changing embedding model or dimension requires a separate compatible index and re-ingestion. The application does not create, delete, resize or empty indexes, and never pads or truncates vectors.

Ingestion uses deterministic document/page/chunk IDs: rerunning overwrites matching chunk IDs. It does **not** remove obsolete IDs when PDFs are shortened, renamed or removed. For such changes, populate a fresh dedicated namespace and switch `PINECONE_NAMESPACE` after successful ingestion. Upserts are batched and are not transactional; a failure can leave completed batches written, so rerun or use a fresh namespace. `INGEST_ON_STARTUP=true` explicitly enables the same write workflow before the server listens.

PDF.js 3's CommonJS build is retained because the original PDFs require its XRef recovery. Evaluation is disabled during extraction. Knowledge PDFs are trusted local inputs; there is deliberately no public upload or ingestion endpoint.

## Tests and production

```bash
npm test
npm run build
NODE_ENV=production npm start
```

Tests require no real credentials, make no live Gemini/Pinecone requests and never alter provider data. They cover the HTTP contract, validation, CORS, security headers, throttling, safe errors, timeouts, the complete RAG flow through mocked SDK boundaries, dimension failures, all five original PDF checksums/extraction, the unchanged prompt, and React submission, retry, cancellation, Markdown, copy and regeneration. If the policy PDFs intentionally change, review and update the original-file checksum assertions in `tests/rag.test.js`.

The production build goes to `client/dist/`; Express serves it on [http://localhost:8080](http://localhost:8080). Run the build before starting production. `npm run dev:server` starts only the API watcher. `Ctrl+C` / SIGTERM stops accepting requests and drains active connections before shutdown.

Baseline security includes Helmet, a restrictive same-origin production CSP, exact-origin CORS, a 2,000-character question limit, 8 KB JSON bodies, a configurable in-memory per-IP query rate limiter, provider/HTTP deadlines, safe errors, no-store API responses and redacted logs. Scope logs include stages, counts, dimensions, filenames and durations without logging question/context/answer text. The GET endpoint is retained for compatibility: configure your reverse proxy to omit or redact query strings in access logs, and use HTTPS in production. Outbound Markdown links omit referrers.

For multiple server instances, use a shared rate-limit store or an edge limiter. The server leaves Express `trust proxy` disabled: configure a precise trusted proxy topology before relying on forwarded client IPs. Deploy behind HTTPS with appropriate operational monitoring. A health response is a process/liveness check, not a fresh provider availability check. Provider deadlines bound outbound calls; a browser cancellation or HTTP timeout does not promise cancellation of work already accepted by a provider.

## API

```http
GET /api/v1/query?question=What%20is%20your%20refund%20policy%3F
```

```json
{ "answer": "..." }
```

```bash
curl --get http://localhost:8080/api/v1/query \
  --data-urlencode 'question=What is your refund policy?'
```

Invalid questions return `400`; throttling returns `429`; upstream failures return `502`/`503`; the request deadline returns `504`. Errors return `{ "error": "safe message" }`, without stack traces or provider payloads.

`GET /api/v1/health` returns `{ "status": "ok", "service": "shopsphere-support" }` after successful startup. No authentication or public ingestion route is introduced.
