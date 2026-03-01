import { expect, test } from '@playwright/test'

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('slot details show attendee timezone and local slot time', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)

	const hostTimeZone = await page.evaluate(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
	)
	await expect(
		page.getByText(`Times are shown in your browser timezone: ${hostTimeZone}`),
	).toBeVisible()

	const shareToken = await page.evaluate(() => {
		const segments = window.location.pathname.split('/').filter(Boolean)
		return segments[1] ?? ''
	})
	expect(shareToken.length).toBeGreaterThan(4)

	const hostSelectedSlots = await page.evaluate(async (token: string) => {
		const response = await fetch(`/api/schedules/${token}`, {
			headers: { Accept: 'application/json' },
		})
		const payload = (await response.json().catch(() => null)) as {
			ok?: boolean
			snapshot?: {
				attendees?: Array<{ id?: string; name?: string; isHost?: boolean }>
				availabilityByAttendee?: Record<string, Array<string>>
			}
		} | null
		if (!response.ok || !payload?.ok || !payload.snapshot)
			return [] as Array<string>
		const hostAttendee = payload.snapshot.attendees?.find(
			(attendee) => attendee?.name === 'Host' || attendee?.isHost === true,
		)
		if (!hostAttendee?.id) return [] as Array<string>
		return payload.snapshot.availabilityByAttendee?.[hostAttendee.id] ?? []
	}, shareToken)
	expect(hostSelectedSlots.length).toBeGreaterThan(0)

	await page.evaluate(
		async (params: { token: string; slots: Array<string> }) => {
			const response = await fetch(
				`/api/schedules/${params.token}/availability`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: 'Alex',
						attendeeTimeZone: 'Pacific/Auckland',
						selectedSlots: params.slots,
					}),
				},
			)
			if (!response.ok) {
				throw new Error(`submit availability failed: ${response.status}`)
			}
		},
		{ token: shareToken, slots: hostSelectedSlots },
	)

	await page.reload()
	const selectedSlotLocator = page.locator('button[aria-pressed="true"]')
	const nextDayButton = page.getByRole('button', { name: 'Show next day' })

	if ((await nextDayButton.count()) > 0) {
		for (let index = 0; index < 14; index += 1) {
			if ((await selectedSlotLocator.count()) > 0) break
			if (await nextDayButton.isDisabled()) break
			await nextDayButton.click()
		}
	}
	await expect.poll(async () => selectedSlotLocator.count()).toBeGreaterThan(0)
	const selectedSlot = selectedSlotLocator.first()
	await expect(selectedSlot).toBeVisible()
	await selectedSlot.click()

	await expect(
		page.getByText(
			new RegExp(`Host\\s+—\\s+.*\\(${escapeRegex(hostTimeZone)}\\)`),
		),
	).toBeVisible()
	await expect(
		page.getByText(/Alex\s+—\s+.*\d.*\(Pacific\/Auckland\)/),
	).toBeVisible()
})
