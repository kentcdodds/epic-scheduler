import { expect, test } from '@playwright/test'

test('submission schedule shows hover tooltip attendee details', async ({
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

	const snapshotResponse = await page.request.get(
		`/api/schedules/${shareToken}`,
	)
	expect(snapshotResponse.ok()).toBe(true)
	const snapshotPayload = (await snapshotResponse.json()) as {
		ok?: boolean
		snapshot?: {
			slots: Array<string>
			blockedSlots: Array<string>
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

	const blockedSlots = new Set(snapshot.blockedSlots ?? [])
	const unblockedSlots = snapshot.slots.filter(
		(slot) => !blockedSlots.has(slot),
	)
	const hostSlots =
		snapshot.availabilityByAttendee[hostAttendee.id] ?? unblockedSlots
	const alexOnlySlot = hostSlots[0] ?? unblockedSlots[0] ?? snapshot.slots[0]
	const unavailableForAlexSlot =
		hostSlots.find((slot) => slot !== alexOnlySlot) ??
		unblockedSlots.find((slot) => slot !== alexOnlySlot) ??
		snapshot.slots.find((slot) => slot !== alexOnlySlot)
	if (!alexOnlySlot || !unavailableForAlexSlot) {
		throw new Error('Expected at least two slots for submission tooltip test.')
	}

	const submitResponse = await page.request.post(
		`/api/schedules/${shareToken}/availability`,
		{
			data: {
				name: 'Alex',
				attendeeTimeZone: 'Pacific/Auckland',
				selectedSlots: [alexOnlySlot],
			},
		},
	)
	expect(submitResponse.ok()).toBe(true)

	await page.goto(`/s/${shareToken}?name=Host`)
	const scheduleGrid = page.locator('[data-schedule-grid-shell]').first()
	const visibleScheduleTable = scheduleGrid.locator('table:visible').first()
	const unavailableForAlexButton = visibleScheduleTable
		.locator(`button[data-slot="${unavailableForAlexSlot}"]`)
		.first()
	const alexOnlySlotButton = visibleScheduleTable
		.locator(`button[data-slot="${alexOnlySlot}"]`)
		.first()
	await expect(unavailableForAlexButton).toBeVisible()
	await expect(alexOnlySlotButton).toBeVisible()

	await unavailableForAlexButton.scrollIntoViewIfNeeded()
	await unavailableForAlexButton.hover()

	const tooltip = page.locator('aside[data-submission-hover-tooltip]').first()
	const alexTooltipRow = tooltip.locator('li', { hasText: 'Alex' })
	await expect(tooltip).toBeVisible()
	await expect(tooltip.locator('li', { hasText: 'Host' })).toBeVisible()
	await expect(alexTooltipRow).toContainText('Pacific/Auckland')

	await expect
		.poll(() =>
			alexTooltipRow.evaluate(
				(element) => getComputedStyle(element).textDecorationLine,
			),
		)
		.toContain('line-through')

	await alexOnlySlotButton.scrollIntoViewIfNeeded()
	await alexOnlySlotButton.hover()
	await expect(tooltip).toBeVisible()
	await expect
		.poll(() =>
			tooltip
				.locator('li', { hasText: 'Alex' })
				.evaluate((element) => getComputedStyle(element).textDecorationLine),
		)
		.not.toContain('line-through')
})
