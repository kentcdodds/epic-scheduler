import { expect, test } from '@playwright/test'

test('home page renders scheduler creation flow', async ({ page }) => {
	await page.goto('/')
	await expect(page).toHaveTitle(/Epic Scheduler/)
	await expect(
		page.getByRole('heading', {
			name: 'Plan once, share once, schedule faster.',
		}),
	).toBeVisible()
	await expect(page.getByLabel('Your name')).toBeVisible()
	await expect(
		page.getByRole('button', { name: 'Create share link' }),
	).toBeVisible()
	await expect(page.getByLabel('Schedule title')).toHaveValue('')
	await expect(page.getByLabel('Your name')).toHaveAttribute(
		'placeholder',
		'Your name',
	)
	await expect(page.getByLabel('Slot interval')).toHaveValue('30')

	const grid = page.locator('[data-schedule-grid-shell]').first()
	const titleInput = page.getByLabel('Schedule title')
	const gridBox = await grid.boundingBox()
	const titleInputBox = await titleInput.boundingBox()
	expect(gridBox).not.toBeNull()
	expect(titleInputBox).not.toBeNull()
	if (!gridBox || !titleInputBox) {
		throw new Error('Expected home page grid and title input to be measurable.')
	}
	expect(titleInputBox.y).toBeGreaterThan(gridBox.y + gridBox.height)
})

test('create schedule link navigates to host dashboard', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	await expect(page).toHaveTitle(/host dashboard \| epic scheduler/i)
	await expect(
		page.getByRole('heading', { name: 'Host dashboard' }),
	).toBeVisible()
	await expect(page.getByText('Attendee submission link')).toBeVisible()
	await expect(page.getByText('Host dashboard link')).toBeVisible()
})

test('slot selection does not require title or name before submit', async ({
	page,
}) => {
	await page.goto('/')

	const scheduleTitleError = page.getByText(
		'Schedule name is required before making a submission.',
	)
	const hostNameError = page.getByText(
		'Host name is required before making a submission.',
	)

	await expect(scheduleTitleError).toHaveCount(0)
	await expect(hostNameError).toHaveCount(0)

	const firstGridCell = page.locator('[data-schedule-grid-shell] table button').first()
	await expect(firstGridCell).toBeVisible()
	await firstGridCell.click()

	await expect(scheduleTitleError).toHaveCount(0)
	await expect(hostNameError).toHaveCount(0)

	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(scheduleTitleError).toBeVisible()
	await expect(hostNameError).toHaveCount(0)
})

test('mobile date header stays sticky while page scrolls', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')

	const grid = page.locator('[data-schedule-grid-shell]').first()
	await expect(grid).toBeVisible()

	const dateHeaderCell = page
		.locator('[data-schedule-grid-shell] thead th[scope="col"]')
		.nth(1)
	await expect(dateHeaderCell).toBeVisible()

	const gridBox = await grid.boundingBox()
	expect(gridBox).not.toBeNull()
	if (!gridBox) {
		throw new Error('Expected schedule grid to be measurable.')
	}

	await page.evaluate((targetScrollY) => {
		window.scrollTo({ top: targetScrollY, behavior: 'instant' })
	}, Math.max(0, gridBox.y + 120))

	const stickyHeaderTop = await dateHeaderCell.evaluate((element) => {
		return Math.round(element.getBoundingClientRect().top)
	})
	expect(stickyHeaderTop).toBeGreaterThanOrEqual(0)
	expect(stickyHeaderTop).toBeLessThanOrEqual(48)
})

test('changing to a smaller interval expands selected availability', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Start date').fill('2026-03-21')
	await page.getByLabel('End date').fill('2026-03-21')

	const selectedCount = page
		.locator('p[role="status"]')
		.filter({ hasText: /selected slot/ })
	await expect(selectedCount).toContainText('0 selected slots')

	await page.getByLabel('Slot interval').selectOption('60')
	const firstGridCell = page.locator('[data-schedule-grid-shell] table button').first()
	await expect(firstGridCell).toBeVisible()
	await firstGridCell.click()
	await expect(selectedCount).toContainText('1 selected slot')

	await page.getByLabel('Slot interval').selectOption('30')
	await expect(selectedCount).toContainText('2 selected slots')
})
