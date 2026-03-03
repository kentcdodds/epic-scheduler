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
- Attendee submission deletion flow (`Delete my submission`) and confirmation
  that the respondent disappears from schedule snapshots/host views.
- Attendee submission rename flow (`Change my name`) and confirmation that the
  old attendee name no longer appears in snapshots/host views.
- Host submission protection (host attendee cannot be deleted or renamed via
  attendee self-service APIs, and host-facing buttons stay hidden).
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
- Desktop drag selection behavior where dragging creates a pending range that
  applies on pointer release and can be canceled with Escape.
- Keyboard-only slot selection behavior on editable grids, including arrow-key
  movement, Shift+arrow range preview, and Enter/Space apply behavior based on
  the first selected range cell.
- Drag autoscroll behavior when pointer nears or exits table edges, so range
  selection can extend without manual wheel/trackpad scroll.
- Attendee slot-detail metadata such as displayed attendee timezone and
  attendee-local time for the selected slot.
- Daylight-saving transition gaps in the grid so missing local times are shown
  as explicit non-interactive `N/A` cells instead of silent empty blocks.
- Collapsed attendee/preview axes when an entire row or column is host-blocked,
  while host unavailable-slots grid still renders the full matrix.
- Integration across the worker, client router, and API endpoints.
- Route-specific document titles for primary pages (`/`, `/s/:shareToken`,
  `/s/:shareToken/:hostAccessToken`, and key marketing pages) so browser-tab
  labels stay accurate after navigation.
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
- Creating a schedule from `/` now redirects to
  `/s/{shareToken}/{hostAccessToken}`; tests that validate attendee availability
  should navigate to `/s/{shareToken}` after extracting the share token.
- Host dashboard data loading now calls
  `/api/schedules/{shareToken}/host-snapshot` and must include `X-Host-Token`;
  add a negative-path check for invalid host access tokens when host-route auth
  changes.
- Host dashboard tests should cover realtime status updates
  (`Realtime connected`) and preview-grid tooltip behavior when attendee
  availability changes.
- Attendee submission tests should cover hover tooltip behavior
  (`aside[data-submission-hover-tooltip]`) including attendee timezone labels
  and availability strike-through styling.
- Host dashboard tests should cover host profile edits (`Host name`) to ensure
  host settings autosave persists after reload.
- Host dashboard tests should cover host-managed submission edits (rename and
  delete) so respondent maintenance remains available from the host page.
- Avoid hidden fixtures or global state in the Playwright tests.

## Assertions

- Assert user-facing results (success message, redirect, visible element).
- When metadata changes are in scope, assert browser-tab titles with
  `await expect(page).toHaveTitle(...)`.
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
