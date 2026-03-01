<div align="center">
  <img src="./public/epic-scheduler-logo.svg" alt="Epic Scheduler logo" width="520" />

  <p>
    <strong>Realtime availability scheduling on Cloudflare Workers + Remix</strong>
  </p>

  <p>
    <a href="https://github.com/kentcdodds/epic-scheduler/actions/workflows/validate.yml"><img src="https://github.com/kentcdodds/epic-scheduler/actions/workflows/validate.yml/badge.svg?branch=main" alt="Validate workflow status" /></a>
    <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Bun-run-f9f1e1?style=flat-square&logo=bun&logoColor=white" alt="Bun" />
    <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
    <img src="https://img.shields.io/badge/Remix-3.0_alpha-000000?style=flat-square&logo=remix&logoColor=white" alt="Remix" />
  </p>
</div>

---

`epic-scheduler` ships a Remix-powered UI, realtime scheduling APIs, websocket
updates, and MCP tools so teams can coordinate overlap with a single share link.

## Quick Start (local development)

```bash
bun install
cp .env.test .env
bun run migrate:local
bun run dev
```

Dev server: `http://localhost:8787`

See [`docs/agents/setup.md`](./docs/agents/setup.md) for full local setup and
verification commands.

## Create your own project from the template

```bash
bunx degit kentcdodds/epic-scheduler my-epic-scheduler-app
cd my-epic-scheduler-app
bun install
bun ./docs/post-download.ts --guided
bun run dev
```

See [`docs/getting-started.md`](./docs/getting-started.md) for guided setup,
Cloudflare resource provisioning, and deploy instructions.

## Tech Stack

| Layer           | Technology                                                            |
| --------------- | --------------------------------------------------------------------- |
| Runtime         | [Cloudflare Workers](https://workers.cloudflare.com/)                 |
| UI Framework    | [Remix 3](https://remix.run/) (alpha)                                 |
| Package Manager | [Bun](https://bun.sh/)                                                |
| Database        | [Cloudflare D1](https://developers.cloudflare.com/d1/)                |
| Access Model    | Link-only (no account required)                                       |
| MCP State       | [Durable Objects](https://developers.cloudflare.com/durable-objects/) |
| E2E Testing     | [Playwright](https://playwright.dev/)                                 |
| Bundler         | [esbuild](https://esbuild.github.io/)                                 |

## Request Lifecycle (high-level)

```
Request → worker/index.ts
              │
              ├─→ /mcp (MCP server)
              ├─→ /ws/:shareToken (realtime websocket room)
              ├─→ static assets (public/)
              └─→ server/handler.ts → server/router.ts routes
```

## Documentation

| Document                                                           | Description                                    |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| [`docs/getting-started.md`](./docs/getting-started.md)             | Setup flow for fresh template installs         |
| [`docs/environment-variables.md`](./docs/environment-variables.md) | Environment variable management                |
| [`docs/cloudflare-offerings.md`](./docs/cloudflare-offerings.md)   | Optional Cloudflare integrations               |
| [`docs/agents/setup.md`](./docs/agents/setup.md)                   | Local development, validation, and CI commands |
| [`docs/architecture/index.md`](./docs/architecture/index.md)       | Runtime architecture map                       |

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://epicweb.dev">Epic Web</a></sub>
</div>
