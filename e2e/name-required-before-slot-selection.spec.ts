import { expect, test } from '@playwright/test'

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('home slot selection requires title and host in order', async ({
	page,
}) => {
	await page.goto('/')

	const scheduleTitleInput = page.getByLabel('Schedule title')
	const nameInput = page.getByLabel('Your name')
	await expect(scheduleTitleInput).toHaveValue('')
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
	const scheduleTitleError = page.locator('#schedule-title-error')
	const hostNameError = page.locator('#host-name-error')
	await expect(firstSlot).toBeVisible()
	await firstSlot.click()

	await expect(scheduleTitleError).toContainText(
		'Schedule name is required before making a submission.',
	)
	await expect(hostNameError).toHaveAttribute('aria-hidden', 'true')
	await expect(scheduleTitleInput).toBeFocused()
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(
		initialSelectedCount,
	)

	await page.keyboard.type('Team sync')
	await expect(scheduleTitleInput).toHaveValue('Team sync')

	await firstSlot.click()
	await expect(hostNameError).toContainText(
		'Host name is required before making a submission.',
	)
	await expect(nameInput).toBeFocused()
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(
		initialSelectedCount,
	)

	await page.keyboard.type('Host')
	await expect(nameInput).toHaveValue('Host')
	await firstSlot.click()
	expect(readSelectedCount(await selectedCountLabel.textContent())).not.toBe(
		initialSelectedCount,
	)
})

test('attendee slot selection requires a name and focuses the name input', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
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

	await expect(page.locator('#attendee-name-error')).toContainText(
		'Name is required before making a submission.',
	)
	await expect(nameInput).toBeFocused()
	await expect(selectedCountLabel).toContainText('0 selected slot')
})
