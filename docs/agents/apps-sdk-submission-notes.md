---
title: Apps SDK submission notes
last-reviewed: 2026-03-21
---

# Apps SDK submission notes

## Tool annotation rationale (OpenAI Apps SDK review)

Use these notes when reviewers ask about `readOnlyHint` on the MCP app-opening
tools.

### `open_schedule_ui`

`open_schedule_ui` is labeled `readOnlyHint: true` because the tool call itself
does not mutate server state. It returns a `ui://` resource pointer + optional
tool input so the host can render the attendee widget. Any writes (saving
availability) happen only after user interaction inside the widget and are
performed by separate write-capable HTTP endpoints or MCP tools (for example,
`submit_schedule_availability`). The annotation reflects the tool’s immediate
side effects, not the downstream actions a user may take within the UI.

### `open_schedule_host_ui`

`open_schedule_host_ui` is labeled `readOnlyHint: true` for the same reason: the
tool call only returns metadata + a resource pointer for rendering the host
dashboard widget. It does not change schedule data. Host edits (title changes,
blocked slots, submission updates) are applied through explicit write actions
inside the widget, backed by write endpoints and tools such as
`update_schedule_host_settings`. The annotation reflects the tool call itself,
not the later UI-driven writes.
