import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'America/New_York' })

test('grid marks spring-forward gaps as explicit N/A cells', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Start date').fill('2026-03-07')
	await page.getByLabel('End date').fill('2026-03-09')

	const visibleGrid = page.locator('[data-schedule-grid-shell] table:visible')
	await expect(visibleGrid).toBeVisible()

	const missingCells = visibleGrid.locator('td[data-missing-slot-cell="true"]')
	await expect(missingCells).toHaveCount(2)
	await expect(missingCells.first()).toContainText('N/A')
	await expect(
		page.getByText(
			'2 cells marked N/A because those local times have no slot in this schedule',
		),
	).toBeVisible()
	await expect(missingCells.first()).toHaveAttribute(
		'title',
		/daylight-saving transitions/i,
	)
})
