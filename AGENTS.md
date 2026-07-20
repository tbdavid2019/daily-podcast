# Daily Podcast Agent Guide

## Project goal

This repository generates a Traditional Chinese daily technology podcast and
serves its articles, audio player, RSS feed, and machine-readable discovery
endpoints from Cloudflare.

The production account uses the Cloudflare Workers Free plan. Treat platform
limits, external API usage, and TTS usage as hard budgets. Prefer changes that
reduce invocations, subrequests, CPU work, persisted Workflow state, KV
operations, and large in-memory buffers.

## Deployment topology

There are two independently deployed Workers. Do not confuse the frontend with
the podcast-generation Workflows.

1. Web Worker (`wrangler.jsonc`)
   - Next.js 15 / React 19 App Router, built by OpenNext for Cloudflare.
   - Entry after build: `.open-next/worker.js`.
   - Serves the website, article pages, RSS, sitemap, agent discovery, and API
     documentation.
   - Reads podcast metadata from `HACKER_NEWS_KV` and checks audio in
     `HACKER_NEWS_R2`.
   - Uses R2 and Durable Objects for OpenNext incremental/tag cache behavior.

2. Generation Worker (`worker/index.ts`, local config `worker/wrangler.jsonc`)
   - Owns the Cron trigger and the public HTTP entry points `/workflow`,
     `/script`, and `/audio`.
   - Exports `PodcastScriptWorkflow` and `PodcastAudioWorkflow`.
   - The script Workflow collects stories, calls the text model, writes the
     generated script to KV, then starts the audio Workflow.
   - The audio Workflow calls the selected TTS provider, stages batches in R2,
     merges them, and writes the final audio object.

Both deployments share the same production KV namespace and R2 bucket. A
change to keys, bindings, dates, variants, or object paths must remain backward
compatible across both Workers or be deployed in a deliberate order.

## Important source map

- `app/`: Next.js routes and pages.
- `components/`: client and server UI components; `components/ui/` is generated
  or vendored shadcn-style code and is excluded from linting.
- `lib/content.ts`: shared KV-to-article reads and Markdown rendering.
- `lib/discovery.ts`: robots, OpenAPI, API catalog, and agent discovery output.
- `config.ts`: podcast metadata and homepage/RSS/sitemap retention windows.
- `worker/index.ts`: backend routing, scheduling, parameter parsing, and
  Workflow creation.
- `workflow/index.ts`: story collection and script generation Workflow.
- `workflow/audio.ts`: audio chunking, TTS batching, R2 merge, and cleanup.
- `workflow/tts.ts`: Gemini, OpenAI, Minimax, and Edge TTS adapters/fallback.
- `workflow/utils.ts`: source fetching, extraction, and audio utilities.
- `wrangler.jsonc`: tracked Web Worker bindings.
- `worker/wrangler.example.jsonc`: safe backend configuration template.
- `worker/wrangler.jsonc`: ignored local/deployment configuration; it can
  contain secrets and must never be printed wholesale or committed.
- `cloudflare-env.d.ts` and `worker-configuration.d.ts`: generated binding
  types; regenerate them instead of hand-editing them.

## Data and routing invariants

- Production data uses `WORKER_ENV` / `NEXTJS_ENV`, defaulting to
  `production`. Keep the values aligned between deployments.
- Dates are `YYYY-MM-DD`. User-visible dates and default keys use Taipei time
  (UTC+8); the default source-fetch date is the previous UTC day. Do not change
  one side without checking the other Worker and RSS/article routes.
- `main` is an alias for the canonical `hacker-news` variant.
- Script KV key: `script:{env}:{variant}:{date}`.
- Legacy content KV key: `content:{env}:hacker-news:{date}`. Web reads still
  fall back to it, so do not remove it without a migration.
- Per-story cached content is prefixed from the legacy content key with
  `:story-contents:`.
- Workflow invocations use deterministic instance IDs. Normal daily IDs are
  derived from environment/date/variant/phase; forced reruns additionally use
  the caller's `Idempotency-Key`.
- The audio child instance ID is derived from the parent script instance ID, so
  retrying the trigger step cannot create a second audio Workflow.
- Final audio object key:
  `{YYYY}/{MM}/{DD}/{env}/{variant}-{YYYY-MM-DD}.mp3`.
- RSS must publish an episode only after the final R2 object exists.

## Commands

Use the pinned pnpm version from `package.json` and the Node version from
`.node-version`.

```bash
pnpm install
pnpm dev                 # Next.js local development
pnpm dev:worker          # Generation Worker with persisted local state
pnpm check               # Lint, typecheck, Workflow tests, and gate tests
pnpm lint
pnpm typecheck
pnpm build               # Next.js build only
pnpm opennext            # Build the actual Web Worker artifact
pnpm preview             # OpenNext build plus local Wrangler
pnpm test:sources        # Live network smoke test for news sources
pnpm run cf-typegen      # Regenerate Web Worker binding types
pnpm workflow:run --today YYYY-MM-DD --force
pnpm workflow:audio --today YYYY-MM-DD
pnpm test:workflow       # Local auth/idempotency/trigger-script tests
pnpm run deploy:worker   # Deploy generation Worker; requires authorization
pnpm run deploy          # Build and deploy Web Worker; requires authorization
pnpm logs:worker
```

Always spell the Web deployment as `pnpm run deploy`; `pnpm deploy` invokes a
different pnpm workspace command.

## Verification requirements

- Before editing, inspect the target file, its related types/tests, and one
  nearby implementation pattern.
- For code changes, run `pnpm check`. `next.config.mjs` no longer skips lint or
  TypeScript validation, so any attempt to restore `ignoreDuringBuilds` or
  `ignoreBuildErrors` must be treated as a build-gate regression.
- For Web runtime or routing changes, also run `pnpm build`; use `pnpm
  opennext` when Cloudflare bundling, bindings, caching, or runtime compatibility
  could be affected.
- For Workflow changes, verify step names remain deterministic and unique,
  retries are safe, and rerunning a step cannot duplicate costly side effects.
- Do not run remote tests, deploy, tail production logs, trigger `/workflow`, or
  call paid AI/TTS APIs unless the user explicitly authorizes the action.
- Report pre-existing failures separately from failures introduced by a change.

## Free-plan engineering rules

Cloudflare limits change. Before an optimization that depends on an exact
quota, verify the current official Workers and Workflows limit pages. The
baseline checked on 2026-07-20 includes a 10 ms active CPU allowance per Free
Worker/Workflow step, 50 external subrequests per invocation, 1,000 internal
Cloudflare-service subrequests, 128 MB memory, and 3 MB Worker size.

- Keep each Workflow `step.do()` small in active CPU work; waiting on network
  I/O is different from CPU time.
- Count redirects and fallback calls as extra external subrequests. Avoid
  retries at multiple nested layers unless their combined worst case is known.
- Avoid returning large objects from Workflow steps because step results are
  persisted. Put long-lived or binary data in R2 and return compact references.
- Do not hold an entire large podcast plus all of its batches in memory when a
  streaming or incremental approach is available.
- Bound parallel fetches and respect the six simultaneous outbound connection
  limit. `Promise.all` does not remove subrequest or memory costs.
- Prefer static assets and cached responses over invoking Next.js SSR. Preserve
  existing `revalidate` behavior unless measurements justify a change.
- Keep homepage and RSS KV reads bounded by pagination/retention settings.
- Minimize KV writes used only for logging or coordination; KV is eventually
  consistent and must not be treated as a strongly consistent lock.

Official references:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workflows/reference/limits/
- https://developers.cloudflare.com/workflows/reference/pricing/

## Security and secrets

- Never commit `.env*`, `.dev.vars`, API keys, bearer tokens, or the ignored
  `worker/wrangler.jsonc`.
- Use Wrangler secrets for server-side credentials. Only values intentionally
  safe for browsers may use the `NEXT_PUBLIC_` prefix.
- Treat `/workflow` as a costly privileged endpoint. Changes must preserve or
  improve authentication, replay/duplicate protection, method validation, and
  rate limiting. A hidden Worker URL is not authentication.
- Do not log request authorization headers, secret values, full third-party
  responses, or configuration files that may contain secrets.
- Sanitize or escape externally sourced HTML before rendering it with
  `dangerouslySetInnerHTML`.

## Code conventions

- TypeScript is strict. Use the `@/` alias for repository-root imports.
- Follow the existing no-semicolon, single-quote style enforced by ESLint.
- Prefer explicit domain types over adding new `any` casts.
- Keep Cloudflare binding interfaces close to the Worker/Workflow that consumes
  them, and keep generated `CloudflareEnv` types current.
- Preserve Traditional Chinese for user-facing podcast content and existing
  operational logs; code identifiers and durable documentation may be English.
- Keep changes focused. Do not combine frontend redesign, Workflow behavior,
  resource-binding changes, and deployment in one unreviewable patch.
- Do not edit generated build directories such as `.next/`, `.open-next/`, or
  `.wrangler/`.

## Optimization order

When asked for general optimization, prioritize:

1. Protect costly trigger endpoints and eliminate duplicate paid work.
2. Restore reliable type/build gates and add focused tests for pure logic.
3. Measure and reduce Workflow subrequests, retries, step state, and audio
   memory use.
4. Reduce Web Worker invocations/KV reads and improve cache hit rates.
5. Improve client bundle, rendering, and visual performance after server-side
   budgets and correctness are under control.
