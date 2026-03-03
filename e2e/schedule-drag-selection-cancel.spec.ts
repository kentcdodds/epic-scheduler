import { expect, test } from '@playwright/test'

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('drag selection applies on mouseup and Escape cancels pending selection', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostUrl = new URL(page.url())
	const shareToken = hostUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	await page.goto(`/s/${shareToken}?name=Alex`)
	await page.getByLabel('Your name').fill('Alex')

	const selectedCountLabel = page.getByText(/selected slot/)
	await expect(selectedCountLabel).toContainText('0 selected slot')

	const table = page.locator('[data-schedule-grid-shell] table:visible').first()
	const availableButtons = table.locator(
		'button[data-slot]:not([aria-disabled="true"])',
	)
	await expect(availableButtons.nth(5)).toBeVisible()
	const startButton = availableButtons.first()
	const endButton = availableButtons.nth(5)

	const startBox = await startButton.boundingBox()
	const endBox = await endButton.boundingBox()
	expect(startBox).not.toBeNull()
	expect(endBox).not.toBeNull()
	if (!startBox || !endBox) {
		throw new Error('Expected drag targets for selection test.')
	}

	await page.mouse.move(
		startBox.x + startBox.width / 2,
		startBox.y + startBox.height / 2,
	)
	await page.mouse.down()
	await page.mouse.move(
		endBox.x + endBox.width / 2,
		endBox.y + endBox.height / 2,
		{
			steps: 12,
		},
	)
	await expect(
		page.getByText(/release to apply or press Escape to cancel/i),
	).toBeVisible()
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(0)

	await page.keyboard.press('Escape')
	await page.mouse.up()
	await expect(
		page.getByText(/release to apply or press Escape to cancel/i),
	).toHaveCount(0)
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(0)

	await page.mouse.move(
		startBox.x + startBox.width / 2,
		startBox.y + startBox.height / 2,
	)
	await page.mouse.down()
	await page.mouse.move(
		endBox.x + endBox.width / 2,
		endBox.y + endBox.height / 2,
		{
			steps: 12,
		},
	)
	await page.mouse.up()

	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBeGreaterThan(0)
})
