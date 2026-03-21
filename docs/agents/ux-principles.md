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

## Keyboard range selection (Shift+arrows)

- After **Enter** or **Space** commits a Shift+arrow rectangular preview, the
  grid keeps that rectangle highlighted as the active keyboard range (same
  overlay as preview, with copy in `selectionSlotLabel` for screen readers)
  until the user moves with an arrow **without** Shift, uses the mouse/touch on
  the grid, toggles a single slot, or starts a new Shift+arrow range.
- While that committed range is shown, **Enter** or **Space** again (with focus
  on a cell inside the range) toggles **every** slot in the rectangle, not just
  the focused cell.

## Schedule grid day header

- The grid uses **two tables** with the same `<colgroup>`: a header table (only
  `thead`) inside `position: sticky; top: 0`, and a body table (`tbody` only) in
  `[data-schedule-grid-scroller]`. Horizontal `scrollLeft` is synced between
  `[data-schedule-grid-header-scroll]` and the body scroller so columns stay
  aligned without a duplicate CSS grid row. The header scroller hides its
  scrollbar (only the body scroller’s bar is visible).
- Both tables use `table-layout: fixed` with **explicit `<col>` widths** for
  every column (time + each day) and a **total width in `rem`**, not
  `width: 100%`—otherwise each scrollport lays out columns independently. Both
  scrollers use `scrollbar-gutter: stable` so the body’s visible scrollbar
  doesn’t change the inline size vs the header. The screen-reader caption lives
  on the body table only so the header table matches the body column model.

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
