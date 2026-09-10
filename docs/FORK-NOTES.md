# Fork stabilization and zoom

Work is isolated on `fix/stabilize-dashboard-zoom`; upstream history and `main` remain unchanged.

## Included
- Restore the missing message helpers, navigation and local summary components.
- Quota-chart time range (1h, 5h, 24h, all), draggable range handles, timestamp-preserving refresh, optional Y zoom, projection visibility and expanded dialog (Escape to close).
- Default to reported data, not future projection. Recent shortcuts end at the last reported sample, not at the future reset.
- Reject cross-origin/cross-site and DNS-rebinding API requests; listen on 127.0.0.1 only.
- Keep unfinished tasks open, preserve repeated prompts across turns, index rate-limit-only events, and avoid showing missing live windows as current readings.
- Restore cross-platform test discovery; tests use temporary databases and cannot read your Codex account.
- Compatible dependency remediation for the five npm findings; no forced major upgrades.

## Astra and pricing
`gpt-6-astra` and dated snapshots use the Standard API text-token equivalent: input $10/M, cached input $1/M, output $50/M. The API long-context multipliers apply to this hypothetical API-equivalent estimate. Reasoning output is not added twice. Unknown variants are left unpriced.

Verified 2026-09-10: https://developers.openai.com/api/docs/models/gpt-6-astra

This is **not** subscription quota or an actual bill. Codex-specific exceptions and metering differ, and Standard API estimates exclude separate cache writes, tool charges and Fast mode. See https://help.openai.com/en/articles/20001415-chatgpt-rate-card-enterprise-token-based-pricing . Other inherited model prices were not all reverified in this change.

## Limitations
Thread quota attribution remains an estimate. A decrease can be a reset or server correction, not proof of abnormal billing. This does not implement an anomaly detector or validate every quota bucket in every Codex version. Account activity from other devices may be absent locally. Historical values are retained, not rewritten to look normal.

## Local upgrade
Stop the server before backing up `data/` (including SQLite WAL/SHM files if present) and `.env`. Fetch this fork and checkout the PR branch without `reset --hard`. Then use Node >=22.13, `npm ci`, `npm test`, `npm run build`, `npm start`. Keep the same working directory to reuse your local database. The parser reindexes local logs once; original logs are never changed.

## Checks
`npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `npm audit --audit-level=high`.
Smoke mode uses synthetic data and never authenticates Codex. Live account behaviour still requires validation on the user's PC.
