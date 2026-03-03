import { expect, test } from '@playwright/test'

test('attendee can rename their saved submission', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	const currentName = 'Alex'
	const nextName = 'Avery'
	await page.goto(`/s/${shareToken}?name=${encodeURIComponent(currentName)}`)
	await expect(page.getByLabel('Your name')).toHaveValue(currentName)

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
					(entry) => entry.name === currentName,
				)
			},
			{ timeout: 16_000 },
		)
		.toBe(true)

	await page.getByLabel('Your name').fill(nextName)
	const renameButton = page.getByRole('button', { name: 'Change my name' })
	await expect(renameButton).toBeVisible({ timeout: 16_000 })
	await renameButton.click()

	await expect(page.getByText('Name updated.')).toBeVisible({ timeout: 16_000 })
	await expect(page.getByLabel('Your name')).toHaveValue(nextName)
	await expect(page.getByText('1 selected slot')).toBeVisible()
	await expect(renameButton).toBeHidden()
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
				const attendeeNames = (payload.snapshot.attendees ?? []).map(
					(entry) => entry.name ?? '',
				)
				return (
					attendeeNames.includes(nextName) &&
					!attendeeNames.includes(currentName)
				)
			},
			{ timeout: 16_000 },
		)
		.toBe(true)
})
