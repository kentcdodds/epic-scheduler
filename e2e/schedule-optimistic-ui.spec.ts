import { expect, test } from '@playwright/test'

test('schedule shows pending optimistic sync cues', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)

	const initiallySelectedSlot = page
		.locator('button[aria-pressed="true"]')
		.first()
	await expect(initiallySelectedSlot).toBeVisible()
	await initiallySelectedSlot.click()

	await expect(page.getByText('Pending remove: 1')).toBeVisible()
	await expect(
		page.getByText(
			/Changes queued for autosave|Unsynced local changes|Saving changes/,
		),
	).toBeVisible()
	await expect(page.getByText('All changes saved')).toBeVisible({
		timeout: 10_000,
	})
})
