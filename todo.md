## Multi-channel same-day episodes (planning)

- [ ] **Keying & storage**: introduce `channel` into all keys/paths (KV contentKey, R2/audio filenames, cache keys, log context) to avoid date collisions; migrate existing default channel to `default`.
- [ ] **Backward compat (KV/R2)**: keep read-path tolerant—when no channel prefix is present, treat as `default` channel; migrate writes to new names, optionally add a one-time copier or lazy-read + re-write to new keys to preserve old episodes in listings.
- [ ] **Config model**: add channel registry (e.g. `channels.ts` or env JSON) defining per-channel sources, limits, prompts/title prefixes, and whether cross-channel dedupe is needed.
- [ ] **Workflow entry**: allow workflow trigger to specify `channel`; default to `default`. Validate channel against registry and inject channel config into limits/prompt/podcast title.
- [ ] **Scheduling**: design cron strategy for multiple feeds per day; ensure Cloudflare workflow limits are respected (possibly staggered runs). Document how to run single feed manually.
- [ ] **Story limits**: refactor `getStoryLimits` to accept channel config; support channel-specific source sets (e.g., tech daily vs. market/companies) and optional per-channel priorities/budgets.
- [ ] **Fetch pipeline**: decide if sources are fetched once and partitioned or fetched per-channel; implement optional cross-channel dedupe policy (share allowed vs. exclusive stories).
- [ ] **Prompts & metadata**: allow per-channel prompt variations (intros, tone) and episode metadata (title prefix, description), surfacing channel name in episode title.
- [ ] **RSS/front-end**: keep single RSS but include channel name in title/description; add front-end filter/tag to distinguish channels. Consider optional per-channel RSS endpoints later.
- [ ] **KV/R2 migration**: implement backward-compatible migration: existing `podcast:${date}` keys should map to `podcast:default:${date}`; avoid breaking historical reads.
- [ ] **Tests/checks**: add coverage for new keying, feed validation, and schedule; include smoke script to render RSS with multi-feed entries.
