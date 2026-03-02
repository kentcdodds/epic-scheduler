import { expect, test } from '@playwright/test'

test('host dashboard can block slots from attendee selection', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/host/i)
	const scheduleUrl = new URL(page.url())
	const shareToken = scheduleUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')
	await expect(
		page.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Host unavailable slots' }),
	).toBeVisible()

	const hostUnavailableGrid = page.locator('[data-schedule-grid-shell]').nth(1)
	const firstHostSlot = hostUnavailableGrid.locator('button[data-slot]').first()
	await expect(firstHostSlot).toBeVisible()
	const blockedSlotValue = await firstHostSlot.getAttribute('data-slot')
	expect(blockedSlotValue).not.toBeNull()
	if (!blockedSlotValue) {
		throw new Error('Expected blocked slot data-slot value.')
	}

	await firstHostSlot.click()
	await expect(page.getByText('1 blocked slot')).toBeVisible()
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
				if (!payload.ok || !payload.snapshot || !blockedSlotValue) return false
				return (
					payload.snapshot.blockedSlots?.includes(blockedSlotValue) ?? false
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
