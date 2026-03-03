import { expect, test } from '@playwright/test'

test.use({ hasTouch: true })

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('home mobile tap-range mode can deselect a selected slot', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')

	const selectedCountLabel = page.getByText(/selected slot/)
	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBeGreaterThan(0)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).toBeGreaterThan(0)

	const selectedSlotLocator = page.locator(
		'[data-schedule-grid-shell] table:visible button[aria-pressed="true"]',
	)
	const nextDayButton = page.locator(
		'button[aria-label="Show next day"]:visible',
	)
	for (let index = 0; index < 14; index += 1) {
		if ((await selectedSlotLocator.count()) > 0) break
		if (await nextDayButton.isDisabled()) break
		await nextDayButton.click()
	}

	const selectedSlot = selectedSlotLocator.first()
	await expect(selectedSlot).toBeVisible()
	await selectedSlot.scrollIntoViewIfNeeded()

	await selectedSlot.tap()
	await selectedSlot.tap()

	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBe(initialCount - 1)
})
