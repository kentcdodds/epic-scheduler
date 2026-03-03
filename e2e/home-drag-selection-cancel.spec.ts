import { expect, test } from '@playwright/test'

function readSelectedCount(text: string | null) {
	const match = text?.match(/(\d+)\s+selected slot/)
	if (!match) return -1
	return Number.parseInt(match[1] ?? '-1', 10)
}

test('home drag selection applies on release and Escape cancels', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
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
			const cells = Array.from(row.querySelectorAll('td')).map((cell) => {
				const button = cell.querySelector('button[data-slot]')
				if (!button) return null
				const isSelected = button.getAttribute('aria-pressed') === 'true'
				return isSelected
			})
			const startCellIndex = cells.findIndex((value) => value === true)
			if (startCellIndex < 0) continue
			const endCellIndex = cells.findIndex(
				(value, index) => index > startCellIndex && value === false,
			)
			if (endCellIndex < 0) continue
			return { rowIndex, startCellIndex, endCellIndex }
		}
		return null
	})
	expect(dragTargets).not.toBeNull()
	if (!dragTargets) {
		throw new Error('Expected home drag target cells.')
	}

	const startCell = visibleGridTable.locator(
		`tbody tr:nth-child(${dragTargets.rowIndex + 1}) td:nth-of-type(${dragTargets.startCellIndex + 1}) button`,
	)
	const endCell = visibleGridTable.locator(
		`tbody tr:nth-child(${dragTargets.rowIndex + 1}) td:nth-of-type(${dragTargets.endCellIndex + 1}) button`,
	)
	await expect(startCell).toBeVisible()
	await expect(endCell).toBeVisible()
	await startCell.scrollIntoViewIfNeeded()
	await endCell.scrollIntoViewIfNeeded()
	await expect(startCell).toHaveAttribute('aria-pressed', 'true')
	await expect(endCell).toHaveAttribute('aria-pressed', 'false')

	const startBox = await startCell.boundingBox()
	const endBox = await endCell.boundingBox()
	expect(startBox).not.toBeNull()
	expect(endBox).not.toBeNull()
	if (!startBox || !endBox) {
		throw new Error('Expected home drag cell bounds.')
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
	).toHaveCount(0)
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(
		initialCount,
	)

	await page.keyboard.press('Escape')
	await page.mouse.up()
	expect(readSelectedCount(await selectedCountLabel.textContent())).toBe(
		initialCount,
	)

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
	await expect(startCell).toHaveAttribute('aria-pressed', 'false')

	const afterCommitCount = readSelectedCount(
		await selectedCountLabel.textContent(),
	)
	expect(afterCommitCount).toBeLessThan(initialCount)
})
