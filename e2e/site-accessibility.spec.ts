import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const staticRoutes = [
	'/',
	'/how-it-works',
	'/meeting-scheduler-features',
	'/blog',
	'/blog/chatgpt-claude-mcp-availability-links',
	'/privacy',
	'/terms',
]

function formatViolations(route: string, violations: Array<{ id: string }>) {
	if (violations.length === 0) return `No violations for ${route}`
	return `${route}: ${violations.map((violation) => violation.id).join(', ')}`
}

for (const colorScheme of ['light', 'dark'] as const) {
	test(`axe audit (${colorScheme}) across core routes`, async ({ browser }) => {
		const context = await browser.newContext({ colorScheme })
		const page = await context.newPage()

		const hourMs = 3_600_000
		const rangeStart = new Date(
			Math.ceil(Date.now() / hourMs) * hourMs + hourMs,
		)
		const rangeEnd = new Date(rangeStart.getTime())
		rangeEnd.setDate(rangeEnd.getDate() + 2)
		const createResponse = await page.request.post('/api/schedules', {
			data: {
				title: 'A11y schedule',
				hostName: 'Host',
				hostTimeZone: 'UTC',
				intervalMinutes: 60,
				rangeStartUtc: rangeStart.toISOString(),
				rangeEndUtc: rangeEnd.toISOString(),
				selectedSlots: [rangeStart.toISOString()],
			},
		})
		expect(createResponse.ok()).toBe(true)
		const createPayload = (await createResponse.json()) as {
			shareToken?: string
		}
		const shareToken = createPayload.shareToken ?? ''
		expect(shareToken).not.toBe('')

		const routes = [
			...staticRoutes,
			`/s/${shareToken}`,
			`/s/${shareToken}/host`,
		]

		for (const route of routes) {
			await page.goto(route)
			await expect(page.locator('body')).toBeVisible()
			const accessibilityScanResults = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa'])
				.analyze()
			expect(
				accessibilityScanResults.violations,
				formatViolations(route, accessibilityScanResults.violations),
			).toEqual([])
		}

		await context.close()
	})
}
