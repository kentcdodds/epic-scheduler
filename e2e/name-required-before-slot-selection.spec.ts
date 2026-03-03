import { expect, test } from '@playwright/test'

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('home slot selection requires a name and focuses the name input', async ({
	page,
}) => {
	await page.goto('/')

	const nameInput = page.getByLabel('Your name')
	await expect(nameInput).toHaveValue('')

	const selectedCountLabel = page.getByText(/selected slot/)
	const initialSelectedCount = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(initialSelectedCount).toBeGreaterThan(0)

	const firstSlot = page
		.locator(
			'[data-schedule-grid-shell] table:visible button[data-slot]:visible',
		)
		.first()
	await expect(firstSlot).toBeVisible()
	await firstSlot.click()

	await expect(page.getByRole('alert')).toContainText(
		'Name is required before making a submission.',
	)
	await expect(nameInput).toBeFocused()
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(
		initialSelectedCount,
	)
})

test('attendee slot selection requires a name and focuses the name input', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	await page.goto(`/s/${shareToken}`)

	const nameInput = page.getByLabel('Your name')
	await expect(nameInput).toHaveValue('')

	const selectedCountLabel = page.getByText(/selected slot/)
	await expect(selectedCountLabel).toContainText('0 selected slot')

	const firstEditableSlot = page
		.locator(
			'[data-schedule-grid-shell] table:visible button[data-slot]:not([aria-disabled="true"]):visible',
		)
		.first()
	await expect(firstEditableSlot).toBeVisible()
	await firstEditableSlot.click()

	await expect(page.getByRole('alert')).toContainText(
		'Name is required before making a submission.',
	)
	await expect(nameInput).toBeFocused()
	await expect(selectedCountLabel).toContainText('0 selected slot')
})
