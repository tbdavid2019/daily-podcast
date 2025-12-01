## Multi-channel / channel-aware redesign (notes)

- **Channel registry**: add `config/channels.ts` exporting a typed list of channels; allow optional override via `CONFIG_CHANNELS_JSON` env. Each channel has:
  - `id` (slug-like), `displayName`/`titlePrefix`
  - `sources` with limits or profile reference
  - `schedule` (days/cron)
  - optional `promptOverrides` (tone/intro/script variations)
  - optional `priority` (for budget trimming) and `dedupePolicy` (shared vs. exclusive stories)
- **Keying/storage**: include `channel` in KV keys, cache keys, and R2/audio paths (`podcast:${channel}:${date}`, `audio/${channel}/${date}...`). Legacy read fallback: if no channel key exists, treat as `default`. New writes always use channel-prefixed keys; consider lazy rewrite to migrate.
- **Workflow entry**: accept `channel` param (default `default`), validate against registry, inject config into limits/prompt/title. Log `channel` for traceability.
- **Limits & sources**: refactor `getStoryLimits` to consume channel config; support channel-specific source sets and optional per-channel priority/budget.
- **Fetching/dedupe**: decide if sources fetched per channel or once-then-partition; implement optional cross-channel dedupe policy.
- **Prompts/meta**: allow per-channel prompt overrides and episode metadata (title prefix, description). Show channel name in episode title.
- **RSS/front-end**: keep single RSS initially; include channel name in title/description and add UI filter/tag. Optionally expose per-channel RSS endpoints later.
- **Scheduling**: define cron per channel or a loop over channels in one invocation (mind workflow time limits); document manual run per channel.
- **Docs**: add channel config guide to `docs/` explaining how to add/adjust channels and migration behavior.
- **Tests**: cover keying fallback, channel validation, limits injection, and RSS rendering with multiple channels.
