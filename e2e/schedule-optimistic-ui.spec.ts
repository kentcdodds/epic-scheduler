import { expect, test } from '@playwright/test'

test('schedule pending sync uses simplified opacity cue', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)

	const gridShell = page.locator('[data-schedule-grid-shell]')
	await expect(gridShell).toBeVisible()
	const initiallySelectedSlot = page
		.locator('button[aria-pressed="true"]')
		.first()
	await expect(initiallySelectedSlot).toBeVisible()
	await initiallySelectedSlot.click()

	await expect
		.poll(
			() => gridShell.evaluate((element) => getComputedStyle(element).opacity),
			{
				timeout: 2_000,
			},
		)
		.toBe('0.6')
	await expect
		.poll(
			() => gridShell.evaluate((element) => getComputedStyle(element).opacity),
			{
				timeout: 10_000,
			},
		)
		.toBe('1')
	await expect(page.getByText(/selected slot/)).toBeVisible({
		timeout: 10_000,
	})
})
