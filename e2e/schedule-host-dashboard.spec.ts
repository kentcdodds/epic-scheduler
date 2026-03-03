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

function parseDateInput(value: string) {
	const [rawYear, rawMonth, rawDay] = value.split('-')
	const year = Number.parseInt(rawYear ?? '', 10)
	const month = Number.parseInt(rawMonth ?? '', 10)
	const day = Number.parseInt(rawDay ?? '', 10)
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	) {
		throw new Error(`Invalid date input value: ${value}`)
	}
	return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

function formatDateInput(date: Date) {
	return date.toISOString().slice(0, 10)
}

function addDateInputDays(value: string, days: number) {
	const next = parseDateInput(value)
	next.setUTCDate(next.getUTCDate() + days)
	return formatDateInput(next)
}

function getDayCountInclusive(startDateInput: string, endDateInput: string) {
	const start = parseDateInput(startDateInput).getTime()
	const end = parseDateInput(endDateInput).getTime()
	const dayMs = 24 * 60 * 60 * 1000
	const diffDays = Math.floor((end - start) / dayMs)
	if (diffDays < 0) {
		throw new Error('End date must not be earlier than start date.')
	}
	return diffDays + 1
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

	const startDateInput = page.getByLabel('Start date')
	const endDateInput = page.getByLabel('End date')
	await expect(startDateInput).toBeVisible()
	await expect(endDateInput).toBeVisible()
	const initialStartDate = await startDateInput.inputValue()
	const initialEndDate = await endDateInput.inputValue()
	expect(initialStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	expect(initialEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	const nextEndDate = addDateInputDays(initialEndDate, -1)
	await endDateInput.fill(nextEndDate)
	await endDateInput.blur()
	await expect(endDateInput).toHaveValue(nextEndDate)
	await expect
		.poll(
			async () => {
				const response = await page.request.get(`/api/schedules/${shareToken}`)
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						slots?: Array<string>
						schedule?: {
							intervalMinutes?: number
						}
					}
				}
				if (!payload.ok || !payload.snapshot?.schedule?.intervalMinutes) {
					return false
				}
				const expectedDays = getDayCountInclusive(initialStartDate, nextEndDate)
				const expectedSlotCount =
					expectedDays * 24 * (60 / payload.snapshot.schedule.intervalMinutes)
				return (payload.snapshot.slots?.length ?? -1) === expectedSlotCount
			},
			{ timeout: 12_000 },
		)
		.toBe(true)

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

test('host dashboard can rename and delete a submission', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	const { shareToken, hostAccessToken } = parseHostRouteTokens(page.url())
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')
	if (!shareToken || !hostAccessToken) {
		throw new Error('Expected host route share and access tokens.')
	}

	const submissionResponse = await page.request.post(
		`/api/schedules/${shareToken}/availability`,
		{
			data: {
				name: 'Alex',
				attendeeTimeZone: 'UTC',
				selectedSlots: [],
			},
		},
	)
	expect(submissionResponse.ok()).toBe(true)
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
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string }>
					}
				}
				if (!payload.ok || !payload.snapshot) return false
				return (
					payload.snapshot.attendees?.some(
						(attendee) => attendee.name === 'Alex',
					) ?? false
				)
			},
			{ timeout: 12_000 },
		)
		.toBe(true)
	await page.reload()

	const alexNameInput = page.getByLabel('Submission name input for Alex')
	await expect(alexNameInput).toBeVisible({ timeout: 12_000 })
	await alexNameInput.fill('Jordan')
	await page.getByLabel('Save renamed submission for Alex').click()

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
				if (!response.ok()) {
					return { hasAlex: false, hasJordan: false }
				}
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string }>
					}
				}
				if (!payload.ok || !payload.snapshot) {
					return { hasAlex: false, hasJordan: false }
				}
				const attendeeNames = payload.snapshot.attendees?.map(
					(attendee) => attendee.name ?? '',
				)
				return {
					hasAlex: attendeeNames?.includes('Alex') ?? false,
					hasJordan: attendeeNames?.includes('Jordan') ?? false,
				}
			},
			{ timeout: 12_000 },
		)
		.toEqual({ hasAlex: false, hasJordan: true })

	await expect(
		page.getByLabel('Submission name input for Jordan'),
	).toBeVisible()
	await page.getByLabel('Delete submission for Jordan').click()

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
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string }>
					}
				}
				if (!payload.ok || !payload.snapshot) return false
				const attendeeNames = payload.snapshot.attendees?.map(
					(attendee) => attendee.name ?? '',
				)
				return attendeeNames?.includes('Jordan') ?? false
			},
			{ timeout: 12_000 },
		)
		.toBe(false)

	await expect(page.getByLabel('Submission name input for Jordan')).toHaveCount(
		0,
	)
})
