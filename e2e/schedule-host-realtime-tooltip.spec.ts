import { expect, test } from '@playwright/test'

test('host dashboard receives realtime updates and shows hover tooltip', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostDashboardUrl = new URL(page.url())
	const shareToken = hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	await expect
		.poll(
			async () => (await page.getByText(/Realtime/).first().textContent()) ?? '',
			{ timeout: 12_000 },
		)
		.toContain('Realtime connected')

	const snapshotResponse = await page.request.get(`/api/schedules/${shareToken}`)
	expect(snapshotResponse.ok()).toBe(true)
	const snapshotPayload = (await snapshotResponse.json()) as {
		ok?: boolean
		snapshot?: {
			slots: Array<string>
			attendees: Array<{ id: string; isHost?: boolean }>
			availabilityByAttendee: Record<string, Array<string>>
		}
	}
	expect(snapshotPayload.ok).toBe(true)
	const snapshot = snapshotPayload.snapshot
	if (!snapshot) {
		throw new Error('Expected schedule snapshot payload.')
	}
	const hostAttendee =
		snapshot.attendees.find((attendee) => attendee.isHost) ??
		snapshot.attendees[0]
	if (!hostAttendee) {
		throw new Error('Expected at least one attendee in snapshot.')
	}
	const hostSlots = snapshot.availabilityByAttendee[hostAttendee.id] ?? []
	const alexOnlySlot = hostSlots[0] ?? snapshot.slots[0]
	const tooltipSlot =
		snapshot.slots.find((slot) => slot !== alexOnlySlot) ?? snapshot.slots[0]
	if (!alexOnlySlot || !tooltipSlot) {
		throw new Error('Expected slots for tooltip test.')
	}

	const submitResponse = await page.request.post(
		`/api/schedules/${shareToken}/availability`,
		{
			data: {
				name: 'Alex',
				attendeeTimeZone: 'UTC',
				selectedSlots: [alexOnlySlot],
			},
		},
	)
	expect(submitResponse.ok()).toBe(true)

	await expect(page.getByText('Alex')).toBeVisible({ timeout: 4_000 })

	const previewGrid = page.locator('[data-schedule-grid-shell]').first()
	const tooltipSlotButton = previewGrid
		.locator(`button[data-slot="${tooltipSlot}"]`)
		.first()
	const alexSlotButton = previewGrid
		.locator(`button[data-slot="${alexOnlySlot}"]`)
		.first()
	await expect(tooltipSlotButton).toBeVisible()
	await expect(alexSlotButton).toBeVisible()

	await tooltipSlotButton.scrollIntoViewIfNeeded()
	await tooltipSlotButton.hover()

	const tooltip = page.locator('aside[role="status"]').first()
	await expect(tooltip).toBeVisible()
	await expect(tooltip.locator('li', { hasText: 'Host' })).toBeVisible()
	await expect(tooltip.locator('li', { hasText: 'Alex' })).toBeVisible()

	const alexTextDecoration = await tooltip
		.locator('li', { hasText: 'Alex' })
		.evaluate((element) => getComputedStyle(element).textDecorationLine)
	expect(alexTextDecoration).toContain('line-through')

	await alexSlotButton.scrollIntoViewIfNeeded()
	await alexSlotButton.hover()
	await expect(tooltip).toBeVisible()
	await expect(tooltip.locator('li', { hasText: 'Alex' })).toBeVisible()
})
