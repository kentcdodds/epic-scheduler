import { defineConfig, devices } from '@playwright/test'

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? '8788'
const baseURL =
	process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${playwrightPort}`

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	webServer: {
		command: 'bun run build:client && bun run preview:e2e',
		url: baseURL,
		// In CI always boot our own server so a stray process on the port cannot
		// satisfy the URL probe and leave tests talking to the wrong app (hangs).
		reuseExistingServer: process.env.CI !== 'true',
		timeout: 180_000,
		env: {
			CLOUDFLARE_ENV: 'test',
			PORT: playwrightPort,
			WRANGLER_LOG_PATH: './logs.local',
			WRANGLER_DISABLE_REQUEST_BODY_DRAINING: 'true',
		},
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
