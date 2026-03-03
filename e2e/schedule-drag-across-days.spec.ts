import { expect, test } from '@playwright/test'

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('desktop drag can paint across day columns', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')

	const selectedCountLabel = page.getByText(/selected slot/)
	await expect
		.poll(async () => readSelectedCount(await selectedCountLabel.textContent()))
		.toBeGreaterThan(0)
	const initialCount = readSelectedCount(await selectedCountLabel.textContent())
	expect(initialCount).toBeGreaterThan(0)

	const visibleGridTable = page
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
	const dragTargets = await visibleGridTable.evaluate((table) => {
		const rows = Array.from(table.querySelectorAll('tbody tr'))
		for (const [rowIndex, row] of rows.entries()) {
			const cells = Array.from(row.querySelectorAll('td'))
			const selectedCellIndexes = cells
				.map((cell, cellIndex) => {
					const isSelected =
						cell.querySelector('button[aria-pressed="true"]') !== null
					return isSelected ? cellIndex : -1
				})
				.filter((cellIndex) => cellIndex >= 0)

			if (selectedCellIndexes.length < 2) continue

			const startCellIndex = selectedCellIndexes[0]
			const endCellIndex = selectedCellIndexes[selectedCellIndexes.length - 1]
			if (startCellIndex === undefined || endCellIndex === undefined) continue
			if (startCellIndex === endCellIndex) continue

			return { rowIndex, startCellIndex, endCellIndex }
		}

		return null
	})

	expect(dragTargets).not.toBeNull()
	if (!dragTargets) return

	const startCell = visibleGridTable.locator(
		`tbody tr:nth-child(${dragTargets.rowIndex + 1}) td:nth-of-type(${dragTargets.startCellIndex + 1}) button`,
	)
	const endCell = visibleGridTable.locator(
		`tbody tr:nth-child(${dragTargets.rowIndex + 1}) td:nth-of-type(${dragTargets.endCellIndex + 1}) button`,
	)
	await expect(startCell).toBeVisible()
	await expect(endCell).toBeVisible()
	await startCell.scrollIntoViewIfNeeded()

	const startBox = await startCell.boundingBox()
	const endBox = await endCell.boundingBox()
	expect(startBox).not.toBeNull()
	expect(endBox).not.toBeNull()
	if (!startBox || !endBox) return

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

	const afterDragCount = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(afterDragCount).toBeLessThanOrEqual(initialCount - 2)
})
