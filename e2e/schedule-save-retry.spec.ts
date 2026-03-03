import { expect, test } from '@playwright/test'

test('attendee auto-save retries after transient failure', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	await page.goto(`/s/${shareToken}`)
	await page.getByLabel('Your name').fill('Alex')

	let availabilityPostRequestCount = 0
	let failedAvailabilitySave = false
	await page.route('**/api/schedules/*/availability', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.continue()
			return
		}
		availabilityPostRequestCount += 1
		if (!failedAvailabilitySave) {
			failedAvailabilitySave = true
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: false,
					error: 'Temporary availability failure',
				}),
			})
			return
		}
		await route.continue()
	})

	const scheduleGrid = page
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
	const firstSlot = scheduleGrid.locator('button[data-slot]:visible').first()
	await expect(firstSlot).toBeVisible()
	const selectedSlot = await firstSlot.getAttribute('data-slot')
	expect(selectedSlot).not.toBeNull()
	if (!selectedSlot) {
		throw new Error('Expected selected slot to have data-slot value.')
	}

	await firstSlot.click()
	await expect(page.getByText('Temporary availability failure')).toBeVisible()

	await expect
		.poll(
			async () => {
				const response = await page.request.get(`/api/schedules/${shareToken}`)
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees: Array<{ id: string; name: string }>
						availabilityByAttendee: Record<string, Array<string>>
					}
				}
				if (!payload.ok || !payload.snapshot) return false
				const alexAttendee = payload.snapshot.attendees.find(
					(attendee) => attendee.name === 'Alex',
				)
				if (!alexAttendee) return false
				const alexSlots =
					payload.snapshot.availabilityByAttendee[alexAttendee.id] ?? []
				return alexSlots.includes(selectedSlot)
			},
			{ timeout: 12_000 },
		)
		.toBe(true)
	expect(availabilityPostRequestCount).toBeGreaterThanOrEqual(2)
})

test('host settings auto-save retries after transient failure', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	let hostUpdatePostRequestCount = 0
	let failedHostUpdate = false
	await page.route('**/api/schedules/*/host', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.continue()
			return
		}
		hostUpdatePostRequestCount += 1
		if (!failedHostUpdate) {
			failedHostUpdate = true
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: false,
					error: 'Temporary host save failure',
				}),
			})
			return
		}
		await route.continue()
	})

	const hostUnavailableGrid = page.locator('[data-schedule-grid-shell]').nth(1)
	const firstHostSlot = hostUnavailableGrid
		.locator('button[aria-pressed="false"]')
		.first()
	await expect(firstHostSlot).toBeVisible()
	const blockedSlot = await firstHostSlot.getAttribute('data-slot')
	expect(blockedSlot).not.toBeNull()
	if (!blockedSlot) {
		throw new Error('Expected host slot to include data-slot value.')
	}

	await firstHostSlot.click()
	await expect(page.getByText('Temporary host save failure')).toBeVisible()

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
				return (payload.snapshot.blockedSlots ?? []).includes(blockedSlot)
			},
			{ timeout: 12_000 },
		)
		.toBe(true)
	expect(hostUpdatePostRequestCount).toBeGreaterThanOrEqual(2)
})

test('host dashboard shows auth error for invalid host key', async ({
	page,
}) => {
	const rangeStart = new Date(Date.UTC(2026, 3, 1, 14, 0, 0))
	const rangeEnd = new Date(Date.UTC(2026, 3, 1, 16, 0, 0))
	const createResponse = await page.request.post('/api/schedules', {
		data: {
			title: 'Auth guard schedule',
			hostName: 'Host',
			hostTimeZone: 'UTC',
			intervalMinutes: 60,
			rangeStartUtc: rangeStart.toISOString(),
			rangeEndUtc: rangeEnd.toISOString(),
			selectedSlots: [rangeStart.toISOString()],
		},
	})
	expect(createResponse.ok()).toBe(true)
	const createPayload = (await createResponse.json()) as { shareToken?: string }
	const shareToken = createPayload.shareToken ?? ''
	expect(shareToken).not.toBe('')

	await page.goto(`/s/${shareToken}/invalid-host-key`)
	await expect(
		page.getByText('Schedule not found or unavailable.'),
	).toBeVisible()
	await expect(page.getByText('Invalid host access token.')).toBeVisible()
})
