# UX principles

Cross-cutting UX expectations for interactive surfaces in this codebase.

## Grid selection persistence

- Editable schedule grids persist the current slot selection in `sessionStorage`
  (keys built in `client/schedule-grid-selection-storage.ts`) so a refresh or
  same-tab history navigation does not wipe in-progress selection.
- The homepage create form also persists title, host name, date range, interval,
  and slot selection under a single key (`HOME_CREATE_FORM_STORAGE_KEY`); legacy
  slot-only keys may still be read once for migration.
- Attendee and host views key by share token (and attendee name for availability
  drafts).

## Mobile schedule grid width

- On small breakpoints, `renderScheduleGrid` uses a viewport-bleed shell so the
  grid’s left/right edges align with the viewport; the scroll container still
  uses horizontal overflow when the table is wider than the screen.

## Avoid layout shift by default

- Reserve space for async feedback, validation, and errors instead of mounting
  and unmounting message containers.
- Keep control footprints stable between idle and pending states (for example,
  fixed button widths while labels change from `Update` to `Saving...`).
- Prefer in-place mode changes that preserve nearby geometry with stable grid
  columns and minimum row heights.
- Validate interaction-heavy changes on both desktop and mobile breakpoints.
