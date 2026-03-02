# End-to-end testing principles

These notes summarize how we approach Playwright tests in this codebase, based
on the Epic Web E2E workshop and our existing setup.

## Goals

- Validate user-visible journeys end-to-end through the worker and client.
- Prefer a few high-signal tests over many brittle ones.
- Keep tests readable and close to how a user describes behavior.

## What to test

- Primary routes and flows (navigation, schedule creation, availability
  updates).
- User-visible sync states for optimistic flows (for example
  pending/saving/saved availability indicators).
- Mobile layout stability for interactive flows so status updates do not shift
  the grid while users are selecting slots.
- Mobile day-pagination controls (previous/next) so only one day is shown at a
  time on narrow viewports and navigation boundaries are enforced.
- Touch-scroll safety on mobile so drag/scroll gestures do not mutate selection
  until touch interaction auto-enables tap-based range selection mode.
- Tap-range selection mode behavior on mobile, including both adding and
  removing ranges when users tap an already selected slot as the range start.
- Attendee slot-detail metadata such as displayed attendee timezone and
  attendee-local time for the selected slot.
- Integration across the worker, client router, and API endpoints.
- Regressions that are expensive to catch in unit tests.

Avoid testing implementation details, styling, or pure utility functions.

## Structure and style

- Keep tests flat: top-level `test(...)` with no `describe` nesting.
- Inline setup per test; avoid shared `beforeEach` unless required.
- Prefer one clear assertion per step and a small number of final assertions.
- Use Playwright’s `expect` and locator APIs (role/label/placeholder).

## Locators

Prefer stable, user-facing selectors:

- `getByRole` for buttons, links, headings, and inputs.
- `getByLabel` for form fields.
- `getByText` only for brief, stable copy.

Avoid `page.locator('css')` unless no accessible alternative exists.

For schedule-grid interactions, scope locators to visible elements (for example
`table:visible` and `button:visible`) because both desktop and mobile tables are
rendered in the DOM and one is hidden with CSS.

## Server and routing

- The test server is started via Playwright `webServer` using Wrangler.
- The base URL defaults to `http://localhost:8788` for Playwright to avoid
  colliding with the dev server. Override with `PLAYWRIGHT_BASE_URL` or
  `PLAYWRIGHT_PORT`.
- Playwright sets `CLOUDFLARE_ENV=test` so Wrangler uses `.env.test`.
- Ensure the `env.test` section in `wrangler.jsonc` includes assets and durable
  objects since these are not inherited from top-level Wrangler config.
- Client routes live in `client/app.tsx` and `client/routes/index.tsx`.
- API endpoints are defined in `server/routes.ts` and mapped in
  `server/router.ts`.

When adding endpoints that accept bodies, ensure POST/PUT requests are not
handled by the static asset fetcher in `worker/index.ts`.

## Test data

- Use real input values and a happy-path payload.
- Use fake participant names (for example `Alex`, `Jordan`) and generated share
  tokens from test-created schedules.
- Avoid hidden fixtures or global state in the Playwright tests.

## Assertions

- Assert user-facing results (success message, redirect, visible element).
- For async actions, wait on the UI result, not arbitrary timeouts.
- For client-router regressions, you may set a `window` marker before clicking a
  link and assert it survives navigation to prove there was no full document
  reload.

## Running tests

Common commands:

- `bun run test:e2e`
- `bun run test:e2e e2e/schedule-collaboration.spec.ts`
- `bun run test:e2e e2e/seo-content.spec.ts`

These tests are executed by the `validate` gate, which also runs `lint:fix` and
the MCP E2E suite.
