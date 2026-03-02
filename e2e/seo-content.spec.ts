import { expect, test } from '@playwright/test'

test('how-it-works page is crawlable and has SEO metadata', async ({
	page,
}) => {
	await page.goto('/how-it-works')
	await expect(
		page.getByRole('heading', {
			name: 'How Epic Scheduler keeps coordination simple',
		}),
	).toBeVisible()

	const description = await page
		.locator('meta[name="description"]')
		.getAttribute('content')
	expect(description).toContain('paintable availability grids')

	await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(
		1,
	)
	const structuredDataText = await page
		.locator('script[type="application/ld+json"]')
		.first()
		.textContent()
	expect(structuredDataText ?? '').toContain('"@type":"HowTo"')
})

test('blog index and post pages render marketing content', async ({ page }) => {
	await page.goto('/blog')
	await expect(
		page.getByRole('heading', {
			name: 'Scheduling guides for practical teams',
		}),
	).toBeVisible()
	await expect(
		page.getByRole('link', {
			name: 'Use ChatGPT and Claude to answer availability links with MCP',
		}),
	).toBeVisible()
	await expect(
		page.getByRole('link', {
			name: 'A practical meeting scheduler for remote teams',
		}),
	).toBeVisible()

	await page.goto('/blog/meeting-scheduler-for-remote-teams')
	await expect(
		page.getByRole('heading', {
			name: 'A practical meeting scheduler for remote teams',
		}),
	).toBeVisible()
	await expect(
		page.getByText('What changes when scheduling is visual'),
	).toBeVisible()

	await page.goto('/blog/chatgpt-claude-mcp-availability-links')
	await expect(
		page.getByRole('heading', {
			name: 'Use ChatGPT and Claude to answer availability links with MCP',
		}),
	).toBeVisible()
	await expect(page.getByText('The one-link prompt pattern')).toBeVisible()
	await expect(
		page.getByRole('img', {
			name: 'Epic Scheduler attendee MCP app widget with share token and attendee name prefilled',
		}),
	).toBeVisible()
})

test('privacy, terms, robots, and sitemap endpoints are available', async ({
	page,
}) => {
	await page.goto('/privacy')
	await expect(
		page.getByRole('heading', { name: 'Privacy policy' }),
	).toBeVisible()

	await page.goto('/terms')
	await expect(
		page.getByRole('heading', { name: 'Terms of service' }),
	).toBeVisible()

	const robotsResponse = await page.request.get('/robots.txt')
	expect(robotsResponse.ok()).toBe(true)
	await expect(robotsResponse.text()).resolves.toContain('Sitemap:')

	const sitemapResponse = await page.request.get('/sitemap.xml')
	expect(sitemapResponse.ok()).toBe(true)
	await expect(sitemapResponse.text()).resolves.toContain('<urlset')
	await expect(sitemapResponse.text()).resolves.toContain('/blog')
})
