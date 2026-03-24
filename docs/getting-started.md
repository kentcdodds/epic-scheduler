# epic-scheduler Template Setup

<!--
If you're an agent reading this, do as much as you can yourself and then
tell the user what else they need to do themselves.
-->

Use these steps to generate a new project from this template and run it on
Cloudflare Workers.

## Create the project with degit

```
bunx degit epicweb-dev/epicflare my-epic-scheduler-app
cd my-epic-scheduler-app
```

## Install dependencies

We use bun for scripts and installs.

```
bun install
```

## Expectations and assumptions

- Bun is installed (uses `bun`/`bunx`).
- You run commands from the repo root (needs `wrangler.jsonc` and
  `package.json`).

See `docs/setup-manifest.md` for required resources and secrets.

For optional Cloudflare offerings (R2, Workers AI, AI Gateway, extra KV), see
`docs/cloudflare-offerings.md`.

## Quick start (local only)

Local development does **not** require creating D1 or KV in Cloudflare. The
checked-in `wrangler.jsonc` uses binding names and `database_name` only;
Wrangler uses a local D1 emulator with `wrangler dev --local`.

1. Copy environment defaults:

```
cp .env.example .env
```

2. Apply migrations to the local D1 database:

```
bun run migrate:local
```

3. Start the app:

```
bun run dev
```

## Full Cloudflare setup (deploy)

1. Configure GitHub Actions secrets for deploy:

- `CLOUDFLARE_API_TOKEN` (Workers deploy + D1 edit access on the correct
  account)
- `APP_BASE_URL` (optional, used in deploy metadata and health reporting)

2. Deploy:

```
bun run deploy
```

Production deploys and PR preview deploys create or resolve the correct D1
database (and any KV namespaces you add) and inject real IDs at deploy time; see
`docs/setup-manifest.md` and `docs/agents/setup.md`.

## Local development

See `docs/agents/setup.md` for local dev commands and verification steps.

## Build and deploy

Build the project:

```
bun run build
```

Deploy to Cloudflare:

```
bun run deploy
```
