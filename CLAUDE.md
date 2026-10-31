# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement

- Talk to the user in Spanish. Everything in the repo (code, UI text, comments, tests, docs, commit messages) is in English.
- When the user asks to see a plan first or not to touch code yet, present the plan and wait for approval before editing files.
- The user runs `git push` himself (this shell can't complete the Git Credential Manager login). Leave commits ready and verified, then hand over.
- Commit messages end with the `Co-Authored-By: Claude ...` trailer: the user wants Claude listed as a contributor.
- Commands for the user to run go in PowerShell syntax (`$env:VAR = "..."; cmd`), not bash `VAR=x cmd`.
- Before every commit: secret scan of the staged diff (connection strings with credentials, `npg_`, tokens, private keys, local paths, personal emails), no Spanish text in versioned files, `npm run audit`, `npm run check:versions`, and the test suites relevant to the change.
- The only secret is the Neon connection string: it lives in Vercel's `DATABASE_URL` (Sensitive) and optionally in the git-ignored `backend/.env`. Never ask for it, print it or write it into files. Never put secrets in `VITE_*` variables.
- **Vulnerabilities are fixed, never published.** Nothing in the public repo may describe an exploitable weakness: README, docs, code comments, this file, test names, commit messages, issues. When you find one, tell the user in the chat (what it is, severity, impact), require the fix before any further push of the affected part, and write the fix's commit message and tests in terms of the correct behavior (e.g. "requires the match token"), not the attack. If the user postpones a low-severity fix, it is recorded outside the repo (a private GitHub security advisory), never in it. Only deliberate scope decisions with negligible impact, no effect on third parties and nothing an attacker can't already see go in the README's "Known limitations"; if in doubt, treat it as a vulnerability. Reports come in privately through `SECURITY.md`.
- The README describes the current state only: no history of earlier versions, no comparisons with the original brief, and no mention of where ideas came from (name patterns with their technical term).

## Commands

Requires Node 24.x and npm 11.x (`engine-strict`). Install with `npm ci` only.

```bash
npm run dev                  # API on :3000 (PGlite, no setup needed) + Vite on :5173
npm run build                # backend (tsc) then frontend (tsc -b && vite build)
npm run preview              # compiled backend + `vite preview` on :4173 (Vercel-like headers)
npm test                     # scripts tests + backend tests + frontend unit + e2e (dev servers)
npm run test:coverage        # backend coverage with thresholds (lines 97 / branches 93 / functions 93)
npm run check:versions       # exact versions, lockfile, .npmrc policy (incl. min-release-age=14)
npm run audit                # npm audit --omit=dev
npm run typecheck -w backend && npm run typecheck -w frontend

npm run test:e2e:prod -w frontend    # same e2e specs against the production build
$env:E2E_BASE_URL = "https://full-stack-tic-tac-toe.vercel.app"; npm run test:e2e:remote -w frontend   # smoke test on the live site (creates 1 real match)
```

Single tests:

```bash
cd backend  && npx tsx --test tests/matches.test.ts                        # one backend file
cd backend  && npx tsx --test --test-name-pattern="409" tests/matches.test.ts
cd frontend && npx tsx --test tests/unit/ai.test.ts                         # one frontend unit file
cd frontend && npx playwright test tests/e2e/menu.spec.ts -g "difficulty"   # one e2e test (starts its own servers)
```

Backend test files run with `--test-concurrency=1` on purpose: each file starts its own embedded Postgres, and running them in parallel causes CPU-starvation timeouts. Keep it that way.

## Architecture

npm workspaces: `backend` (Express API), `frontend` (React SPA), plus root `api/` and `vercel.json` for deployment.

**Deployment model.** On Vercel the SPA is static (`frontend/dist`) and the whole Express app runs as one function: `api/index.js` re-exports the *compiled* `backend/dist/vercel.js`, and `vercel.json` rewrites `/api/(.*)` to it. The SPA fallback rewrite excludes `/assets/` so a missing chunk returns 404 instead of `index.html`. `vercel.json` is also the single source of the security headers: `frontend/vite.config.ts` reads them for `vite preview`, so production e2e tests run under the real CSP.

**Backend (MVC).**
- Two entry points share `bootstrap.ts` (open database → `ensureSchema` → `createApp`):
  - `src/index.ts`: long-running server with graceful shutdown;
  - `src/vercel.ts`: serverless; lazy schema creation per instance, `trust proxy = 1`, and a JSON 503 app when the config is invalid.
- `createApp(options)` never listens, so tests build apps around their own pool.
- `src/db/database.ts` always returns a `pg` Pool:
  - with `DATABASE_URL`: Neon;
  - otherwise: PGlite exposed through `pglite-socket` on port 0, so dev, tests and production share one driver and code path.
- `models/` is the only layer with SQL. Queries are parameterized (`$1`); `${COLUMNS}` is a constant. The model maps snake_case columns to the camelCase API shape and validates rows with Zod.
- `schemas/` (Zod) is the single source of validation and DTO types. Params and query are parsed in controllers; bodies go through the `validateBody` and `requireJson` middlewares.
- There is no migration tool: `db/schema.ts` is idempotent DDL run under `pg_advisory_xact_lock`. Schema changes must stay idempotent and backward compatible with existing Neon data.
- Errors: throw `AppError` (`errors.ts`). `middlewares/error-handler.ts` maps parser errors to 400/413/415, Postgres connectivity failures to 503 with `Retry-After`, and everything else to a generic 500 logged with its stack.
- Rate limiting (`middlewares/rate-limit.ts`):
  - reads use an in-memory limiter mounted *before* the DB-ready middleware;
  - writes use `models/rate-limit-store.ts` (a Postgres table, shared across Vercel instances);
  - client IPs are SHA-256 hashed, never stored raw.
- Backend imports use `.js` extensions (NodeNext ESM).

**API contract.**
- `POST /api/matches` starts a match (`winner: null`) and returns its `finishToken` (32 random bytes, base64url) only in that response; the database stores just its SHA-256 (`finish_token_hash`, `lib/match-token.ts`).
- `PATCH /api/matches/:id` with `Authorization: Bearer <finishToken>` and `{ winner: "You" | "AI" | "Draw" }` finishes it. `middlewares/match-token.ts` runs before the JSON/body middlewares: no Bearer credential → 401 (`WWW-Authenticate: Bearer`); it hashes whatever token is sent into a typed `res.locals.matchTokenHash`, without checking its format. The model checks the hash in the same atomic `UPDATE`; any other token (or a row created before tokens existed) → 403, checked before anything else is revealed. Finishing is idempotent: the same result again → 200 with the saved match, a different one → 409.
- `db/schema.ts` adds `finish_token_hash` inside a `DO` block that checks `information_schema` first, because `ALTER TABLE … ADD COLUMN IF NOT EXISTS` takes an exclusive lock even when it's a no-op and the schema runs on every cold start.
- `GET /api/matches` is keyset-paginated (`limit` ≤ 100, `before=<id>`, `Link: rel="next"` header).
- `GET /api/matches/stats` returns totals.
- Timestamps are `TIMESTAMPTZ` in the database and formatted as UTC-3 ISO strings by `lib/time.ts`.

**Frontend.**
- The game logic and the AI (minimax with Easy/Normal/Hard) are pure modules in `src/game/`, fully client-side.
- `store/create-game-store.ts` (Zustand) drives a match. It receives the API calls as a dependency, so `tests/unit/game-store.test.ts` runs it with a fake API; `store/game-store.ts` only wires in the real API.
  - Status flow: `idle → starting` (POST) `→ flipping` (coin flip) `→ playing → finished` (PATCH).
  - The match token from `createMatch` is kept in store memory (`matchToken`, never localStorage) and sent with every save attempt, also after a rematch.
  - Saving retries only network, 429 and 5xx errors and keeps retrying after a rematch; a retry after a lost response gets 200 thanks to the idempotent PATCH. When retries run out the status is `failed` (the modal offers Retry); any other 4xx ends as `rejected` ("can no longer be saved", no Retry).
  - Leaving `/play` while the POST is pending stops the match once it answers, while tolerating StrictMode's unmount and remount.
  - The turn handoff waits for the mark animation (`MARK_DRAW_MS`).
  - Matches abandoned mid-game stay unfinished in the history.
- `api/errors.ts` (`ApiError`, `errorMessage`) has no `import.meta.env`, so Node unit tests can import it. `api/client.ts` reads `VITE_API_URL` and can't be imported outside Vite.
- `history-store` handles pagination and stats; `settings-store` persists the difficulty in localStorage under `tic-tac-toe-settings`.
- `api/client.ts` parses the API error shape, rejects 2xx responses that aren't JSON and exposes headers (for `Link`). The base URL is `VITE_API_URL`: absolute in dev, `/api` in production.
- Every page is `React.lazy` inside one `Suspense` in `App.tsx`. New pages must be lazy too, and heavy optional libraries use dynamic `import()` (confetti loads on a win).
  - On `vite:preloadError` the app reloads once (guard in `lib/chunk-reload.ts`).
  - `ErrorBoundary` wraps the `Suspense` and is keyed by pathname.
- The CSP forbids `blob:` workers (hence confetti's `useWorker: false`) and inline scripts.

**E2E setup.** `playwright.config.ts` starts a real backend (in-memory PGlite, high rate limits) on :3100 and Vite on :5174 with `workers: 1`. Everything uses `127.0.0.1`, not `localhost`: by default Vite listens only on `::1` on Windows, and Chromium connecting to `localhost` sometimes stalled until the test timed out. The configs pass `E2E_HOST=127.0.0.1`, which `vite.config.ts` uses as the server and preview host; keep URLs and hosts in sync. Vite uses `strictPort` because CORS allows exact origins only. Tests fix `Math.random` with `addInitScript` for deterministic AI games and wait on conditions (`expect.poll`) rather than intermediate states. Tests that need page chunks skip unless the base URL is the production preview (:4173).

## Dependency policy

- Exact versions only.
- `min-release-age=14` in `.npmrc`, and Dependabot uses a matching 14-day cooldown. npm only enforces the window when resolving new versions, so check that new transitive dependencies comply too.
- Exception for security fixes: `npm audit fix --min-release-age-exclude=<pkg>`, as with `body-parser` 2.4.0.
- `@electric-sql/pglite-socket` pins an exact `@electric-sql/pglite` peer version: upgrade them together.
