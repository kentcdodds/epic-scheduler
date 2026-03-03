import { type Locator, expect, test } from '@playwright/test'

const tapRangeStartMessagePattern =
	/Range start selected\. Tap another slot to (add|remove) range\./

function readSelectedCount(text: string | null): number | null {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match?.[1]) return null
	return Number.parseInt(match[1], 10)
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
	await page.getByLabel('Your name').fill('Host')

	const selectedSlot = page.locator('button[aria-pressed="true"]').first()
	const selectedCountLabel = page.getByText(/selected slot/)

	await expect(selectedSlot).toBeVisible()
	await expect
		.poll(async () => {
			const count = readSelectedCount(await selectedCountLabel.textContent())
			return count !== null && count > 0
		})
		.toBe(true)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).not.toBeNull()
	if (initialCount === null) {
		throw new Error('Unable to parse selected slot count.')
	}
	expect(initialCount).toBeGreaterThan(0)

	await dispatchTouchTap(selectedSlot)
	await expect(page.getByText(tapRangeStartMessagePattern)).toBeVisible()
	const countAfterTouchTap = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterTouchTap).not.toBeNull()
	expect(countAfterTouchTap).toBe(initialCount)

	await selectedSlot.click()
	const countAfterMouseClick = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterMouseClick).not.toBeNull()
	expect(countAfterMouseClick).toBe(initialCount - 1)
})

test('shared schedule grid auto-switches between touch tap mode and mouse drag mode', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	const shareToken =
		new URL(page.url()).pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')
	await page.goto(`/s/${shareToken}?name=Host`)

	const selectedSlot = page.locator('button[aria-pressed="true"]').first()
	const selectedCountLabel = page.getByText(/selected slot/)

	await expect(selectedSlot).toBeVisible()
	await expect
		.poll(async () => {
			const count = readSelectedCount(await selectedCountLabel.textContent())
			return count !== null && count > 0
		})
		.toBe(true)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).not.toBeNull()
	if (initialCount === null) {
		throw new Error('Unable to parse selected slot count.')
	}
	expect(initialCount).toBeGreaterThan(0)

	await dispatchTouchTap(selectedSlot)
	await expect(page.getByText(tapRangeStartMessagePattern)).toBeVisible()
	const countAfterTouchTap = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterTouchTap).not.toBeNull()
	expect(countAfterTouchTap).toBe(initialCount)

	await selectedSlot.click()
	const countAfterMouseClick = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(countAfterMouseClick).not.toBeNull()
	expect(countAfterMouseClick).toBe(initialCount - 1)
})
