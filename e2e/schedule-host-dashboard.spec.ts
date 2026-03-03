import { expect, test } from '@playwright/test'

function readBlockedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+blocked slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

function parseHostRouteTokens(url: string) {
	const scheduleUrl = new URL(url)
	const segments = scheduleUrl.pathname.split('/').filter(Boolean)
	return {
		shareToken: segments[1] ?? '',
		hostAccessToken: segments[2] ?? '',
	}
}

test('host dashboard can block slots from attendee selection', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	const { shareToken } = parseHostRouteTokens(page.url())
	expect(shareToken).not.toBe('')
	await expect(
		page.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()
	const hostTimeZone = await page.evaluate(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
	)
	await expect(
		page.getByText(`Times are shown in your browser timezone: ${hostTimeZone}`),
	).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Host unavailable slots' }),
	).toBeVisible()
	const blockedCountLabel = page.getByText(/blocked slot/)
	const initialBlockedCount = readBlockedCount(
		await blockedCountLabel.first().textContent(),
	)
	expect(initialBlockedCount).toBeGreaterThanOrEqual(0)

	const hostUnavailableGrid = page.locator('[data-schedule-grid-shell]').nth(1)
	const firstHostSlot = hostUnavailableGrid
		.locator('button[aria-pressed="false"]')
		.first()
	const secondHostSlot = hostUnavailableGrid
		.locator('button[aria-pressed="false"]')
		.nth(1)
	await expect(firstHostSlot).toBeVisible()
	await expect(secondHostSlot).toBeVisible()
	const blockedSlotValue = await firstHostSlot.getAttribute('data-slot')
	const secondBlockedSlotValue = await secondHostSlot.getAttribute('data-slot')
	expect(blockedSlotValue).not.toBeNull()
	expect(secondBlockedSlotValue).not.toBeNull()
	if (!blockedSlotValue) {
		throw new Error('Expected blocked slot data-slot value.')
	}
	if (!secondBlockedSlotValue) {
		throw new Error('Expected second blocked slot data-slot value.')
	}

	await firstHostSlot.hover()
	await page.mouse.down()
	await secondHostSlot.hover()
	await page.mouse.up()
	await expect
		.poll(async () =>
			readBlockedCount(await blockedCountLabel.first().textContent()),
		)
		.toBe(initialBlockedCount + 2)
	await expect
		.poll(
			async () => {
				const response = await page.request.get(`/api/schedules/${shareToken}`)
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						blockedSlots?: Array<string>
					}
				}
				if (!payload.ok || !payload.snapshot) return false
				const blocked = payload.snapshot.blockedSlots ?? []
				return (
					blocked.includes(blockedSlotValue) &&
					blocked.includes(secondBlockedSlotValue)
				)
			},
			{ timeout: 12_000 },
		)
		.toBe(true)

	const submitBlockedSlotResponse = await page.request.post(
		`/api/schedules/${shareToken}/availability`,
		{
			data: {
				name: 'Alex',
				attendeeTimeZone: 'UTC',
				selectedSlots: [blockedSlotValue],
			},
		},
	)
	expect(submitBlockedSlotResponse.ok()).toBe(true)
	const submitBlockedSlotPayload = (await submitBlockedSlotResponse.json()) as {
		ok?: boolean
		snapshot?: {
			countsBySlot?: Record<string, number>
			availableNamesBySlot?: Record<string, Array<string>>
		}
	}
	expect(submitBlockedSlotPayload.ok).toBe(true)
	expect(
		submitBlockedSlotPayload.snapshot?.countsBySlot?.[blockedSlotValue] ?? 0,
	).toBe(0)
	expect(
		submitBlockedSlotPayload.snapshot?.availableNamesBySlot?.[
			blockedSlotValue
		] ?? [],
	).not.toContain('Alex')
})

test('host dashboard can update host name', async ({ page }) => {
	await page.goto('/')
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
