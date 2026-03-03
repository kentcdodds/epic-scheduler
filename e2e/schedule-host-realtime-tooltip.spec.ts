import { expect, test } from '@playwright/test'

test('host dashboard keeps attendee summary stable across hover changes', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	await expect
		.poll(
			async () =>
				(await page
					.getByText(/Realtime/)
					.first()
					.textContent()) ?? '',
			{ timeout: 12_000 },
		)
		.toContain('Realtime connected')

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
	const hoveredSlot =
		hostSlots.find((slot) => slot !== alexOnlySlot) ??
		unblockedSlots.find((slot) => slot !== alexOnlySlot) ??
		snapshot.slots.find((slot) => slot !== alexOnlySlot) ??
		snapshot.slots[0]
	if (!alexOnlySlot || !hoveredSlot) {
		throw new Error('Expected slots for summary test.')
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

	await expect(
		page.locator('label').filter({ hasText: 'Alex' }).first(),
	).toBeVisible({
		timeout: 4_000,
	})

	const summary = page.locator('[data-host-preview-attendee-summary]').first()
	await expect(summary).toBeVisible()
	await expect(summary).toContainText('No range selected yet.')
	await expect(summary).toContainText(
		'Showing total available slots per attendee.',
	)
	await expect(
		summary.locator('[data-host-preview-attendee]').filter({
			hasText: 'Alex (1) - UTC',
		}),
	).toHaveCount(1)

	const previewGrid = page.locator('[data-schedule-grid-shell]').first()
	const hoveredSlotButton = previewGrid
		.locator(`button[data-slot="${hoveredSlot}"]`)
		.first()
	const alexSlotButton = previewGrid
		.locator(`button[data-slot="${alexOnlySlot}"]`)
		.first()
	await expect(hoveredSlotButton).toBeVisible()
	await expect(alexSlotButton).toBeVisible()
	const summaryRowCount = await summary
		.locator('[data-host-preview-attendee]')
		.count()
	await alexSlotButton.scrollIntoViewIfNeeded()
	await hoveredSlotButton.hover()
	await expect(summary).toBeVisible()
	await expect(summary.locator('[data-host-preview-attendee]')).toHaveCount(
		summaryRowCount,
	)
	await page.mouse.move(0, 0)
	await expect(summary).toBeVisible()
	await expect(summary.locator('[data-host-preview-attendee]')).toHaveCount(
		summaryRowCount,
	)
})
