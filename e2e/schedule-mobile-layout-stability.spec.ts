import { expect, test } from '@playwright/test'

test('mobile selection keeps schedule grid vertically stable', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)

	const grid = page.locator('table').first()
	await expect(grid).toBeVisible()
	const selectedSlotLocator = page.locator('button[aria-pressed="true"]')
	const nextDayButton = page.getByRole('button', { name: 'Show next day' })
	for (let index = 0; index < 14; index += 1) {
		if ((await selectedSlotLocator.count()) > 0) break
		if (await nextDayButton.isDisabled()) break
		await nextDayButton.click()
	}
	const selectedSlot = selectedSlotLocator.first()
	await expect(selectedSlot).toBeVisible()
	await selectedSlot.scrollIntoViewIfNeeded()

	const initialGridBox = await grid.boundingBox()
	expect(initialGridBox).not.toBeNull()

	await selectedSlot.click()
	await expect(page.getByText('Pending remove: 1')).toBeVisible()

	const pendingGridBox = await grid.boundingBox()
	expect(pendingGridBox).not.toBeNull()

	await expect(page.getByText('All changes saved')).toBeVisible({
		timeout: 10_000,
	})
	const settledGridBox = await grid.boundingBox()
	expect(settledGridBox).not.toBeNull()

	const initialY = initialGridBox?.y ?? 0
	const pendingY = pendingGridBox?.y ?? 0
	const settledY = settledGridBox?.y ?? 0

	expect(Math.abs(pendingY - initialY)).toBeLessThanOrEqual(2)
	expect(Math.abs(settledY - initialY)).toBeLessThanOrEqual(2)
})
