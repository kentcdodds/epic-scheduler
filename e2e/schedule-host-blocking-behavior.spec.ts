import { expect, test } from '@playwright/test'

test('host blocked slots propagate to attendee in realtime', async ({
	browser,
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostUrl = new URL(page.url())
	const pathParts = hostUrl.pathname.split('/').filter(Boolean)
	const shareToken = pathParts[1] ?? ''
	const hostAccessToken = pathParts[2] ?? ''
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')

	const attendeeContext = await browser.newContext()
	const attendeePage = await attendeeContext.newPage()
	try {
		await attendeePage.goto(`/s/${shareToken}?name=Alex`)
		await attendeePage.getByLabel('Your name').fill('Alex')
		await expect(attendeePage.getByText('Realtime connected')).toBeVisible({
			timeout: 12_000,
		})

		const attendeeTable = attendeePage
			.locator('[data-schedule-grid-shell] table:visible')
			.first()
		const targetButton = attendeeTable
			.locator('button[data-slot]:not([aria-disabled="true"])')
			.first()
		await expect(targetButton).toBeVisible()
		const targetSlot = await targetButton.getAttribute('data-slot')
		expect(targetSlot).toBeTruthy()
		if (!targetSlot) {
			throw new Error('Expected target slot for attendee realtime test.')
		}

		const blockResponse = await page.request.post(
			`/api/schedules/${shareToken}/host`,
			{
				headers: {
					'Content-Type': 'application/json',
					'X-Host-Token': hostAccessToken,
				},
				data: {
					blockedSlots: [targetSlot],
				},
			},
		)
		expect(blockResponse.ok()).toBe(true)

		await expect(
			attendeeTable.locator(`button[data-slot="${targetSlot}"]`),
		).toHaveAttribute('aria-disabled', 'true', {
			timeout: 6_000,
		})
	} finally {
		await attendeeContext.close()
	}
})

test('attendee and preview tables collapse fully blocked row and column', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostUrl = new URL(page.url())
	const pathParts = hostUrl.pathname.split('/').filter(Boolean)
	const shareToken = pathParts[1] ?? ''
	const hostAccessToken = pathParts[2] ?? ''
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')

	const hostUnavailableTable = page
		.locator('[data-schedule-grid-shell]')
		.nth(1)
		.locator('table:visible')
		.first()
	await expect(hostUnavailableTable).toBeVisible()

	const axisSelection = await hostUnavailableTable.evaluate((table) => {
		const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
		const firstRow = bodyRows[0]
		if (!firstRow) return null
		const firstRowCells = Array.from(firstRow.querySelectorAll('td'))
		const firstCell = firstRowCells[0]
		const firstButton =
			firstCell?.querySelector<HTMLButtonElement>('button[data-slot]')
		if (!firstButton) return null
		const firstSlot = firstButton.getAttribute('data-slot')
		if (!firstSlot) return null
		const columnIndex = firstRowCells.indexOf(firstCell)
		if (columnIndex < 0) return null

		const rowSlots = firstRowCells
			.map((cell) => cell.querySelector<HTMLButtonElement>('button[data-slot]'))
			.map((button) => button?.getAttribute('data-slot'))
			.filter((slot): slot is string => typeof slot === 'string')
		const columnSlots = bodyRows
			.map((row) =>
				row
					.querySelectorAll('td')
					.item(columnIndex)
					?.querySelector<HTMLButtonElement>('button[data-slot]')
					?.getAttribute('data-slot'),
			)
			.filter((slot): slot is string => typeof slot === 'string')

		return {
			targetSlot: firstSlot,
			blockedSlots: Array.from(new Set([...rowSlots, ...columnSlots])),
		}
	})
	expect(axisSelection).not.toBeNull()
	if (!axisSelection) {
		throw new Error('Expected host row/column slot data.')
	}

	const blockResponse = await page.request.post(
		`/api/schedules/${shareToken}/host`,
		{
			headers: {
				'Content-Type': 'application/json',
				'X-Host-Token': hostAccessToken,
			},
			data: {
				blockedSlots: axisSelection.blockedSlots,
			},
		},
	)
	expect(blockResponse.ok()).toBe(true)

	await expect(
		page
			.locator('[data-schedule-grid-shell]')
			.nth(1)
			.locator('table:visible')
			.first()
			.locator(`button[data-slot="${axisSelection.targetSlot}"]`),
	).toBeVisible()
	await expect(
		page
			.locator('[data-schedule-grid-shell]')
			.first()
			.locator('table:visible')
			.first()
			.locator(`button[data-slot="${axisSelection.targetSlot}"]`),
	).toHaveCount(0)

	await page.goto(`/s/${shareToken}?name=Alex`)
	await expect(page.getByLabel('Your name')).toBeVisible()
	await expect(
		page
			.locator('[data-schedule-grid-shell]')
			.first()
			.locator('table:visible')
			.first()
			.locator(`button[data-slot="${axisSelection.targetSlot}"]`),
	).toHaveCount(0)
})
