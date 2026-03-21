import { expect, test } from '@playwright/test'

test('schedule MCP widget loads an existing link and saves availability', async ({
	page,
	request,
}) => {
	const hourMs = 3_600_000
	const rangeStart = new Date(Math.ceil(Date.now() / hourMs) * hourMs + hourMs)
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
	if (
		typeof createPayload.shareToken !== 'string' ||
		createPayload.shareToken.trim().length === 0
	) {
		throw new Error('Expected /api/schedules to return a non-empty shareToken')
	}
	const shareToken = createPayload.shareToken

	await page.goto(
		`/dev/schedule-ui?shareToken=${encodeURIComponent(shareToken)}&attendeeName=${encodeURIComponent('Alex')}`,
	)

	await expect(
		page.getByRole('heading', { name: 'Your availability' }),
	).toBeVisible()
	await expect(page.getByText('Share token:')).toContainText(shareToken, {
		timeout: 10_000,
	})
	await expect(
		page.getByText('This MCP app loads the same attendee page as the web app'),
	).toBeVisible()
	await expect(page.getByLabel('Your name')).toHaveValue('Alex')
	await expect(page.locator('[data-route-iframe]')).toHaveAttribute(
		'src',
		new RegExp(`/s/${shareToken}\\?name=Alex$`),
	)

	const attendeeFrame = page.frameLocator('[data-route-iframe]')
	await expect(
		attendeeFrame.getByRole('heading', { name: 'MCP widget schedule' }),
	).toBeVisible()
	await expect(attendeeFrame.getByLabel('Your name')).toHaveValue('Alex')
	const firstSlotButton = attendeeFrame
		.locator('[data-schedule-grid-scroller] button[data-slot]')
		.nth(1)
	const clickedSlot = await firstSlotButton.getAttribute('data-slot')
	expect(clickedSlot).not.toBeNull()
	await firstSlotButton.click()
	await expect(attendeeFrame.getByText('Delete my submission')).toBeVisible()
	const scheduleResponse = await request.get(`/api/schedules/${shareToken}`)
	expect(scheduleResponse.ok()).toBe(true)
	const schedulePayload = (await scheduleResponse.json()) as {
		ok?: boolean
		snapshot?: {
			availabilityByAttendee?: Record<string, Array<string>>
			attendees?: Array<{ id: string; name: string }>
		}
	}
	expect(schedulePayload.ok).toBe(true)
	const attendeeId = schedulePayload.snapshot?.attendees?.find(
		(attendee) => attendee.name === 'Alex',
	)?.id
	expect(attendeeId).toBeTruthy()
	expect(
		schedulePayload.snapshot?.availabilityByAttendee?.[attendeeId!],
	).toContain(clickedSlot!)
})

test('schedule host MCP widget loads the real host dashboard route', async ({
	page,
	request,
}) => {
	const hourMs = 3_600_000
	const rangeStart = new Date(Math.ceil(Date.now() / hourMs) * hourMs + hourMs)
	const rangeEnd = new Date(rangeStart.getTime())
	rangeEnd.setDate(rangeEnd.getDate() + 2)

	const createResponse = await request.post('/api/schedules', {
		data: {
			title: 'MCP host widget schedule',
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

	await page.goto(
		`/dev/schedule-host-ui?shareToken=${encodeURIComponent(createPayload.shareToken)}&hostAccessToken=${encodeURIComponent(createPayload.hostAccessToken)}`,
	)

	await expect(
		page.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()
	await expect(page.getByText('Share token:')).toContainText(
		createPayload.shareToken,
	)
	await expect(page.getByText('Host access token:')).toContainText(
		createPayload.hostAccessToken,
	)
	await expect(page.locator('[data-route-iframe]')).toHaveAttribute(
		'src',
		new RegExp(
			`/s/${createPayload.shareToken}/${createPayload.hostAccessToken}$`,
		),
	)

	const hostFrame = page.frameLocator('[data-route-iframe]')
	await expect(
		hostFrame.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()
	await expect(hostFrame.getByText('Attendee submission link')).toBeVisible()
	await expect(hostFrame.getByText('Host dashboard link')).toBeVisible()
})
