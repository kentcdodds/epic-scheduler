import { expect, test } from '@playwright/test'

test('home page renders scheduler creation flow', async ({ page }) => {
	await page.goto('/')
	await expect(page).toHaveTitle('Epic Scheduler')
	await expect(
		page.getByRole('heading', {
			name: 'Plan once, share once, schedule faster.',
		}),
	).toBeVisible()
	await expect(page.getByLabel('Your name')).toBeVisible()
	await expect(
		page.getByRole('button', { name: 'Create share link' }),
	).toBeVisible()
})

test('create schedule link navigates to schedule page', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)
	await expect(
		page.getByRole('button', { name: 'Save availability' }),
	).toBeVisible()
})
