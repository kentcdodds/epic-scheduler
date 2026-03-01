import { expect, test } from '@playwright/test'

test('schedule MCP widget can create and fetch a schedule', async ({
	page,
}) => {
	await page.goto('/dev/schedule-ui')

	await expect(
		page.getByRole('heading', { name: 'Schedule availability' }),
	).toBeVisible()

	await page.getByRole('button', { name: 'Fill 9-5 weekdays' }).click()
	await page.getByRole('button', { name: 'Create and load schedule' }).click()

	const output = page.locator('[data-output]')
	await expect(output).toContainText('shareToken', { timeout: 10_000 })

	const createdOutput = await output.textContent()
	const tokenMatch = createdOutput?.match(/"shareToken":\s*"([^"]+)"/)
	expect(tokenMatch?.[1]).toBeTruthy()

	const shareToken = tokenMatch![1]
	await page.getByLabel('Share token').fill(shareToken)
	await page.getByRole('button', { name: /^Load schedule$/ }).click()
	await expect(output).toContainText('"ok": true')
})
