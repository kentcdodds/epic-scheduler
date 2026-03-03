import { expect, test } from '@playwright/test'

test('marketing pages expose page-specific titles', async ({ page }) => {
	await page.goto('/how-it-works')
	await expect(page).toHaveTitle(
		'How Epic Scheduler works | Link-based meeting coordination',
	)

	await page.goto('/meeting-scheduler-features')
	await expect(page).toHaveTitle('Meeting scheduler features for small teams')

	await page.goto('/blog')
	await expect(page).toHaveTitle('Scheduling blog | Epic Scheduler')

	await page.goto('/privacy')
	await expect(page).toHaveTitle('Privacy policy | Epic Scheduler')

	await page.goto('/terms')
	await expect(page).toHaveTitle('Terms of service | Epic Scheduler')
})

test('schedule routes expose page-specific titles', async ({ page }) => {
	const rangeStart = new Date(Date.UTC(2026, 3, 1, 14, 0, 0))
	const rangeEnd = new Date(Date.UTC(2026, 3, 1, 16, 0, 0))
	const createResponse = await page.request.post('/api/schedules', {
		data: {
			title: 'Page title test schedule',
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
		hostAccessToken?: string
	}
	const shareToken = createPayload.shareToken ?? ''
	const hostAccessToken = createPayload.hostAccessToken ?? ''
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')

	await page.goto(`/s/${shareToken}`)
	await expect(
		page.getByRole('heading', { name: 'Page title test schedule' }),
	).toBeVisible()
	await expect(page).toHaveTitle(
		'Page title test schedule availability | Epic Scheduler',
	)

	await page.goto(`/s/${shareToken}/${hostAccessToken}`)
	await expect(
		page.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()
	await expect(page).toHaveTitle(
		'Page title test schedule host dashboard | Epic Scheduler',
	)
})

test('missing blog post sets a not-found title', async ({ page }) => {
	await page.goto('/blog/definitely-not-a-post')
	await expect(
		page.getByRole('heading', { name: 'Page not found' }),
	).toBeVisible()
	await expect(page).toHaveTitle('Page not found | Epic Scheduler')
})
