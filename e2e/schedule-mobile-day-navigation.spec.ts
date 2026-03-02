import { expect, test } from '@playwright/test'

test('mobile schedule grid shows one day with prev/next navigation', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/host/i)
	const shareToken =
		new URL(page.url()).pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')
	await page.goto(`/s/${shareToken}?name=Host`)

	const table = page.locator('[data-schedule-grid-shell] table:visible')
	await expect(table).toBeVisible()
	await expect(table.locator('thead tr th')).toHaveCount(2)

	const previousDayButton = page.getByRole('button', {
		name: 'Show previous day',
	})
	const nextDayButton = page.getByRole('button', { name: 'Show next day' })
	await expect(previousDayButton).toBeDisabled()
	await expect(nextDayButton).toBeEnabled()

	const dayHeader = table.locator('thead tr th').nth(1)
	const firstDayText = (await dayHeader.textContent())?.trim() ?? ''
	await nextDayButton.click()
	await expect(previousDayButton).toBeEnabled()
	await expect(dayHeader).not.toHaveText(firstDayText)

	for (let index = 0; index < 14; index += 1) {
		if (await nextDayButton.isDisabled()) break
		await nextDayButton.click()
	}
	await expect(nextDayButton).toBeDisabled()

	const viewport = page.viewportSize()
	const tableBounds = await table.boundingBox()
	expect(viewport).not.toBeNull()
	expect(tableBounds).not.toBeNull()
	expect(tableBounds?.width ?? 0).toBeGreaterThanOrEqual(
		Math.max(0, (viewport?.width ?? 390) - 8),
	)
})
