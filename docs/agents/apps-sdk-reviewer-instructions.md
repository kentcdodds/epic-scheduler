# Apps SDK reviewer instructions (token-based access)

Epic Scheduler is intentionally account-free. Access is granted through share
tokens and host access tokens, not usernames/passwords, OAuth, or MFA. Use the
guidance below to complete the OpenAI submission form fields that ask for
authentication or demo credentials.

## Submission form fields

- **Authentication method:** None (link/token-based access).
- **Test credentials:** Not applicable. Provide demo tokens or instructions.

## Option A: fixed demo tokens (recommended for review)

Replace `<app-base-url>` with the submitted MCP server base URL. Ensure the demo
schedule has sample availability so the attendee and host views load data.

- **Attendee (share link):**
  - Share token: `<share-token>`
  - URL: `<app-base-url>/s/<share-token>`
- **Host dashboard:**
  - Share token: `<share-token>`
  - Host access token: `<host-access-token>`
  - URL: `<app-base-url>/s/<share-token>/<host-access-token>`

Paste the URLs above into the submission form "Reviewer instructions" field.

## Option B: generate tokens during review

1. Call `create_schedule` to generate a new `shareToken` and `hostAccessToken`.
2. Host dashboard: open `/s/{shareToken}/{hostAccessToken}` or call
   `open_schedule_host_ui` with both tokens.
3. Attendee view: open `/s/{shareToken}` or call `open_schedule_ui` with
   `shareToken` (and optional `attendeeName`).
4. Submit availability from the attendee view and confirm the host dashboard
   updates.

## Suggested test prompts (submission form)

- "Create a 30-minute schedule for next week for Demo Host and return the
  shareToken and hostAccessToken."
- "Open the host dashboard for shareToken {shareToken} with hostAccessToken
  {hostAccessToken} and block Tuesday 9-11am."
- "Open the attendee UI for shareToken {shareToken} as Alex and submit
  availability."

## Notes for reviewers and maintainers

- Tokens are the only access mechanism; treat the host access token like a
  password.
- If you rotate demo tokens, update this file and the submission notes.
