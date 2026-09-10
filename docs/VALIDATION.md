# Validation of the stabilization/zoom change

Date: 2026-09-10. No real Codex account credentials or user logs were used in these checks.

## Initial verified build

GitHub Actions run: https://github.com/tiagopatriciosantos/Codex-Dashboard/actions/runs/34489535632

- Node 22 / Ubuntu: clean locked dependency install, frontend and backend TypeScript checks, 19 passing unit/regression tests, production build, HTTP smoke test, dependency audit.
- HTTP smoke: demo health and overview, production assets, allowed same-origin refresh, rejected cross-origin refresh and DNS-rebinding Host header.
- npm audit result: 0 vulnerabilities (including 0 high and 0 critical) at verification time. This is not a guarantee against undiscovered vulnerabilities.
- Original audit findings: baseline-browser-mapping (moderate), browserslist (high), nanoid (high), postcss (moderate), qs (moderate).
- Dependency fixes were generated with package-lock-only/ignore-scripts, reviewed, applied without force/major-version changes, and validated by npm ci. The one-time patch/apply workflows have been removed. Regular CI has read-only repository permissions.

## Browser interaction check

Chromium, production assets downloaded from the successful Actions artifact, synthetic demo-overview fixture. Rendered offline, without an account connection.

Passed: initial rendering without JavaScript exceptions; projection hidden initially; 5h/7d switch; 1h and All presets; dragging a Brush handle changes the selected timestamps/sample count; manual selection survives data refresh; Expand opens a large native dialog; Y autoscale; projection toggle; Escape closes the dialog; 390px mobile rendering/expanded chart without page horizontal overflow.

Desktop viewport 1440x1000; mobile viewport 390x844. Screenshots generated during the check contain synthetic data, not the user's usage.

## Continuous checks

The PR's Dashboard CI runs on Windows and Linux: npm ci, typecheck, 19 tests, production build, demo HTTP smoke, audit (high threshold). The checks attached to the final PR commit are authoritative; do not infer final status from earlier commits.

## Remaining limits

The browser test used a mock response, while the HTTP smoke ran the actual backend in demo mode. Live Codex CLI 0.147.0/account integration and existing local databases must still be checked on the user's Windows PC. This change does not prove that any observed quota change is an OpenAI metering error. Per-thread quota attribution is approximate; activity from other clients/accounts/buckets may not be covered.
