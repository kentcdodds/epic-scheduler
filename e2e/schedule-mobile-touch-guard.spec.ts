import { expect, test } from '@playwright/test'

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('mobile touch pointerdown does not paint-select while scrolling', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)

	const selectedCountLabel = page.getByText(/selected slot/)
	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBeGreaterThan(0)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).toBeGreaterThan(0)

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

	await selectedSlot.dispatchEvent('pointerdown', {
		pointerType: 'touch',
		pointerId: 1,
		isPrimary: true,
		bubbles: true,
	})
	await selectedSlot.dispatchEvent('pointerup', {
		pointerType: 'touch',
		pointerId: 1,
		isPrimary: true,
		bubbles: true,
	})

	const afterTouchCount = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(afterTouchCount).toBe(initialCount)
})
