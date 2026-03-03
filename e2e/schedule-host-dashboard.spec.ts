import { expect, test } from '@playwright/test'

function parseHostRouteTokens(url: string) {
	const scheduleUrl = new URL(url)
	const segments = scheduleUrl.pathname.split('/').filter(Boolean)
	return {
		shareToken: segments[1] ?? '',
		hostAccessToken: segments[2] ?? '',
	}
}

test('host dashboard can update host name', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host Original')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const { shareToken, hostAccessToken } = parseHostRouteTokens(page.url())
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')
	if (!shareToken || !hostAccessToken) {
		throw new Error('Expected host route share and access tokens.')
	}

	const hostNameInput = page.getByLabel('Host name')
	await expect(hostNameInput).toHaveValue('Host Original')
	await hostNameInput.fill('Host Renamed')

	await expect
		.poll(
			async () => {
				const response = await page.request.get(
					`/api/schedules/${shareToken}/host-snapshot`,
					{
						headers: {
							'X-Host-Token': hostAccessToken,
						},
					},
				)
				if (!response.ok()) return ''
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string; isHost?: boolean }>
					}
				}
				if (!payload.ok || !payload.snapshot) return ''
				const hostAttendee = payload.snapshot.attendees?.find(
					(attendee) => attendee.isHost,
				)
				return hostAttendee?.name ?? ''
			},
			{ timeout: 12_000 },
		)
		.toBe('Host Renamed')

	await page.reload()
	await expect(page.getByLabel('Host name')).toHaveValue('Host Renamed')
})

test('all-attendees preview mode shows partial slot availability counts', async ({
	page,
	request,
}) => {
	const hourMs = 3_600_000
	const rangeStart = new Date(Math.ceil(Date.now() / hourMs) * hourMs + hourMs)
	const firstSlot = rangeStart.toISOString()
	const secondSlot = new Date(rangeStart.getTime() + hourMs).toISOString()
	const rangeEnd = new Date(rangeStart.getTime() + hourMs * 2)

	const createResponse = await request.post('/api/schedules', {
		data: {
			title: 'Preview availability schedule',
			hostName: 'Host',
			hostTimeZone: 'UTC',
			intervalMinutes: 60,
			rangeStartUtc: rangeStart.toISOString(),
			rangeEndUtc: rangeEnd.toISOString(),
			selectedSlots: [firstSlot, secondSlot],
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

	const attendeeResponse = await request.post(
		`/api/schedules/${shareToken}/availability`,
		{
			data: {
				name: 'Alex',
				attendeeTimeZone: 'UTC',
				selectedSlots: [firstSlot],
			},
		},
	)
	expect(attendeeResponse.ok()).toBe(true)

	await page.goto(`/s/${shareToken}/${hostAccessToken}`)
	const previewSection = page
		.locator('section')
		.filter({
			has: page.getByRole('heading', { name: 'Best-time preview' }),
		})
		.first()
	await expect(
		previewSection.getByRole('button', {
			name: 'All selected attendees',
			exact: true,
		}),
	).toHaveAttribute('aria-pressed', 'true')
	const hostOnlySlotCell = previewSection
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
		.locator(`button[data-slot="${secondSlot}"]`)
	await expect(hostOnlySlotCell).toBeVisible()
	await expect(hostOnlySlotCell).toHaveText('1')
	await expect(hostOnlySlotCell).toHaveAttribute(
		'aria-label',
		/1 attendee available/,
	)
})
