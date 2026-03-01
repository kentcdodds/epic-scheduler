import { type Locator, expect, test } from '@playwright/test'

const tapRangeStartMessagePattern =
	/Range start selected\. Tap another slot to (add|remove) range\./

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

async function dispatchTouchTap(target: Locator) {
	await target.dispatchEvent('pointerdown', {
		pointerType: 'touch',
		pointerId: 1,
		isPrimary: true,
		bubbles: true,
	})
	await target.dispatchEvent('pointerup', {
		pointerType: 'touch',
		pointerId: 1,
		isPrimary: true,
		bubbles: true,
	})
	await target.dispatchEvent('click', { bubbles: true })
}

test('home grid auto-switches between touch tap mode and mouse drag mode', async ({
	page,
}) => {
	await page.goto('/')

	const selectedSlot = page.locator('button[aria-pressed="true"]').first()
	const selectedCountLabel = page.getByText(/selected slot/)
	const modeIndicator = page.getByText(/Selection mode:/)

	await expect(selectedSlot).toBeVisible()
	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBeGreaterThan(0)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).toBeGreaterThan(0)

	await dispatchTouchTap(selectedSlot)
	await expect(page.getByText(tapRangeStartMessagePattern)).toBeVisible()
	await expect(modeIndicator).toContainText('tap start/end')
	const countAfterTouchTap = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterTouchTap).toBe(initialCount)

	await selectedSlot.click()
	await expect(modeIndicator).toContainText('click and drag')
	const countAfterMouseClick = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterMouseClick).toBe(initialCount - 1)
})

test('shared schedule grid auto-switches between touch tap mode and mouse drag mode', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)

	const selectedSlot = page.locator('button[aria-pressed="true"]').first()
	const selectedCountLabel = page.getByText(/selected slot/)
	const modeIndicator = page.getByText(/Selection mode:/)

	await expect(selectedSlot).toBeVisible()
	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBeGreaterThan(0)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).toBeGreaterThan(0)

	await dispatchTouchTap(selectedSlot)
	await expect(page.getByText(tapRangeStartMessagePattern)).toBeVisible()
	await expect(modeIndicator).toContainText('tap start/end')
	const countAfterTouchTap = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterTouchTap).toBe(initialCount)

	await selectedSlot.click()
	await expect(modeIndicator).toContainText('click and drag')
	await expect(page.getByText('Pending remove: 1')).toBeVisible()
	const countAfterMouseClick = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterMouseClick).toBe(initialCount - 1)
})
