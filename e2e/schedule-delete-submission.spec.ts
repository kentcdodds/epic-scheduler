import { expect, test } from '@playwright/test'

test('attendee can delete their own submission', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	const attendeeName = 'Alex'
	await page.goto(`/s/${shareToken}?name=${encodeURIComponent(attendeeName)}`)
	await expect(page.getByLabel('Your name')).toHaveValue(attendeeName)
	await expect(
		page.getByRole('button', { name: 'Delete my submission' }),
	).toBeHidden()

	const attendeeGrid = page
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
	const slotButton = attendeeGrid
		.locator('button[aria-pressed="false"]')
		.first()
	await expect(slotButton).toBeVisible()
	await slotButton.click()

	await expect
		.poll(
			async () => {
				const response = await page.request.get(`/api/schedules/${shareToken}`)
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string }>
					}
				}
				if (!payload.ok || !payload.snapshot) return false
				return (payload.snapshot.attendees ?? []).some(
					(entry) => entry.name === attendeeName,
				)
			},
			{ timeout: 16_000 },
		)
		.toBe(true)

	const deleteButton = page.getByRole('button', {
		name: 'Delete my submission',
	})
	await expect(deleteButton).toBeVisible({ timeout: 16_000 })
	await deleteButton.click()

	await expect(page.getByText('Submission deleted.')).toBeVisible({
		timeout: 16_000,
	})
	await expect(page.getByText('0 selected slots')).toBeVisible()
	await expect(deleteButton).toBeHidden()
	await expect
		.poll(
			async () => {
				const response = await page.request.get(`/api/schedules/${shareToken}`)
				if (!response.ok()) return true
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string }>
					}
				}
				if (!payload.ok || !payload.snapshot) return true
				return (payload.snapshot.attendees ?? []).some(
					(entry) => entry.name === attendeeName,
				)
			},
			{ timeout: 16_000 },
		)
		.toBe(false)
})
