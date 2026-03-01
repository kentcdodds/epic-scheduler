import { expect, test } from '@playwright/test'

test('schedule MCP widget loads an existing link and saves availability', async ({
	page,
	request,
}) => {
	const rangeStart = new Date()
	rangeStart.setMinutes(0, 0, 0)
	const rangeEnd = new Date(rangeStart.getTime())
	rangeEnd.setDate(rangeEnd.getDate() + 2)

	const createResponse = await request.post('/api/schedules', {
		data: {
			title: 'MCP widget schedule',
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
		ok?: boolean
		shareToken?: string
	}
	expect(createPayload.ok).toBe(true)
	expect(typeof createPayload.shareToken).toBe('string')
	const shareToken = createPayload.shareToken ?? ''

	await page.goto('/dev/schedule-ui')

	await expect(
		page.getByRole('heading', { name: 'Schedule availability' }),
	).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Open schedule link' }),
	).toBeVisible()
	await expect(
		page.getByText(/Need a new link first\? Use the create_schedule MCP tool/),
	).toBeVisible()

	await page.getByLabel('Share token').fill(shareToken)
	await page.getByRole('button', { name: /^Load schedule$/ }).click()
	const output = page.locator('[data-output]')
	await expect(output).toContainText('"ok": true', { timeout: 10_000 })

	await page.getByLabel('Your name').fill('Alex')
	const firstSlotButton = page
		.locator('[data-grid-host] button[data-slot]')
		.first()
	await firstSlotButton.click()
	await expect(page.locator('[data-pending-count]')).toHaveText('1')
	await expect(
		page.getByRole('heading', { name: 'Slot details' }),
	).toBeVisible()

	await page.getByRole('button', { name: 'Save availability' }).click()
	await expect(page.locator('[data-pending-count]')).toHaveText('0')
	await expect(output).toContainText('"snapshot"')
})
