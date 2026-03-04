import { expect, test } from '@playwright/test'

test('browser back restores host dashboard scroll position', async ({
	page,
	request,
}) => {
	const hourMs = 3_600_000
	const rangeStart = new Date(Math.ceil(Date.now() / hourMs) * hourMs + hourMs)
	const rangeEnd = new Date(rangeStart.getTime() + hourMs * 72)
	const selectedSlot = rangeStart.toISOString()

	const createResponse = await request.post('/api/schedules', {
		data: {
			title: 'Scroll restoration schedule',
			hostName: 'Host',
			hostTimeZone: 'UTC',
			intervalMinutes: 60,
			rangeStartUtc: rangeStart.toISOString(),
			rangeEndUtc: rangeEnd.toISOString(),
			selectedSlots: [selectedSlot],
		},
	})
	expect(createResponse.ok()).toBe(true)
	const createPayload = (await createResponse.json()) as {
		ok?: boolean
		shareToken?: string
		hostAccessToken?: string
	}
	expect(createPayload.ok).toBe(true)
	if (
		typeof createPayload.shareToken !== 'string' ||
		createPayload.shareToken.trim().length === 0 ||
		typeof createPayload.hostAccessToken !== 'string' ||
		createPayload.hostAccessToken.trim().length === 0
	) {
		throw new Error(
			'Expected /api/schedules to return non-empty share and host access tokens.',
		)
	}

	const shareToken = createPayload.shareToken
	const hostAccessToken = createPayload.hostAccessToken
	await page.goto(`/s/${shareToken}/${hostAccessToken}`)
	await expect(
		page.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()

	const maxHostScroll = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight,
	)
	expect(maxHostScroll).toBeGreaterThan(200)
	const targetHostScroll = Math.min(600, Math.max(maxHostScroll - 1, 200))

	await page.evaluate(
		(scrollTop) => window.scrollTo(0, scrollTop),
		targetHostScroll,
	)
	await expect
		.poll(() => page.evaluate(() => window.scrollY), { timeout: 6_000 })
		.toBeGreaterThanOrEqual(targetHostScroll - 5)

	await page.getByRole('link', { name: 'New schedule' }).click()
	await expect(page).toHaveURL('/')
	await expect(
		page.getByRole('heading', {
			name: 'Plan once, share once, schedule faster.',
		}),
	).toBeVisible()

	await page.goBack()
	await expect(page).toHaveURL(
		new RegExp(`/s/${shareToken}/${hostAccessToken}$`),
	)
	await expect
		.poll(() => page.evaluate(() => window.scrollY), { timeout: 6_000 })
		.toBeGreaterThanOrEqual(targetHostScroll - 5)
})
