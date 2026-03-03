import { expect, test, type Locator, type Page } from '@playwright/test'

function buildRangeStart() {
	const hourMs = 3_600_000
	return new Date(Math.ceil(Date.now() / hourMs) * hourMs + hourMs)
}

type CreatedSchedule = {
	shareToken: string
	hostAccessToken: string
}

async function createSchedule(page: Page) {
	const rangeStart = buildRangeStart()
	const rangeEnd = new Date(rangeStart.getTime())
	rangeEnd.setDate(rangeEnd.getDate() + 2)
	const secondSelectedSlot = new Date(rangeStart.getTime() + 3_600_000)

	const createResponse = await page.request.post('/api/schedules', {
		data: {
			title: 'Keyboard attendee schedule',
			hostName: 'Host',
			hostTimeZone: 'UTC',
			intervalMinutes: 60,
			rangeStartUtc: rangeStart.toISOString(),
			rangeEndUtc: rangeEnd.toISOString(),
			selectedSlots: [
				rangeStart.toISOString(),
				secondSelectedSlot.toISOString(),
			],
		},
	})
	expect(createResponse.ok()).toBe(true)
	const payload = (await createResponse.json()) as {
		shareToken?: string
		hostAccessToken?: string
	}
	const shareToken = payload.shareToken ?? ''
	const hostAccessToken = payload.hostAccessToken ?? ''
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')
	return { shareToken, hostAccessToken } satisfies CreatedSchedule
}

async function getFocusedSlot(page: Page) {
	return page.evaluate(() => {
		const activeElement = document.activeElement
		if (!(activeElement instanceof HTMLButtonElement)) return null
		return activeElement.dataset.slot ?? null
	})
}

async function findHorizontalPair(params: {
	table: Locator
	pressed: 'true' | 'false'
}) {
	return params.table.evaluate((table, pressed) => {
		const rows = Array.from(table.querySelectorAll('tbody tr'))
		for (const row of rows) {
			const buttons = Array.from(row.querySelectorAll('td button[data-slot]'))
			for (let index = 0; index < buttons.length - 1; index += 1) {
				const current = buttons[index]
				const next = buttons[index + 1]
				if (!current || !next) continue
				if (current.getAttribute('aria-pressed') !== pressed) continue
				const anchorSlot = current.getAttribute('data-slot')
				const nextSlot = next.getAttribute('data-slot')
				if (!anchorSlot || !nextSlot) continue
				return { anchorSlot, nextSlot }
			}
		}
		return null
	}, params.pressed)
}

async function findVerticalPair(params: {
	table: Locator
	pressed: 'true' | 'false'
}) {
	return params.table.evaluate((table, pressed) => {
		const rows = Array.from(table.querySelectorAll('tbody tr'))
		for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
			const currentRow = rows[rowIndex]
			const nextRow = rows[rowIndex + 1]
			if (!(currentRow instanceof HTMLTableRowElement)) continue
			if (!(nextRow instanceof HTMLTableRowElement)) continue
			const currentButtons = Array.from(
				currentRow.querySelectorAll('td button[data-slot]'),
			)
			const nextButtons = Array.from(
				nextRow.querySelectorAll('td button[data-slot]'),
			)
			for (
				let columnIndex = 0;
				columnIndex < currentButtons.length;
				columnIndex += 1
			) {
				const current = currentButtons[columnIndex]
				const next = nextButtons[columnIndex]
				if (!current || !next) continue
				if (current.getAttribute('aria-pressed') !== pressed) continue
				const anchorSlot = current.getAttribute('data-slot')
				const nextSlot = next.getAttribute('data-slot')
				if (!anchorSlot || !nextSlot) continue
				return { anchorSlot, nextSlot }
			}
		}
		return null
	}, params.pressed)
}

test('home grid supports keyboard shift-range add/remove with first-cell mode', async ({
	page,
}) => {
	await page.goto('/')
	await page.keyboard.press('Tab')
	await expect(
		page.getByRole('link', { name: 'Skip to main content' }),
	).toBeFocused()

	const table = page.locator('[data-schedule-grid-shell] table:visible').first()

	const addPair = await findHorizontalPair({ table, pressed: 'false' })
	expect(addPair).not.toBeNull()
	if (!addPair) return
	const addAnchor = table.locator(`button[data-slot="${addPair.anchorSlot}"]`)
	const addNext = table.locator(`button[data-slot="${addPair.nextSlot}"]`)
	await addAnchor.focus()
	await page.keyboard.press('Shift+ArrowRight')
	await expect.poll(() => getFocusedSlot(page)).toBe(addPair.nextSlot)
	await page.keyboard.press('Space')
	await expect(addAnchor).toHaveAttribute('aria-pressed', 'true')
	await expect(addNext).toHaveAttribute('aria-pressed', 'true')

	const removePair = await findHorizontalPair({ table, pressed: 'true' })
	expect(removePair).not.toBeNull()
	if (!removePair) return
	const removeAnchor = table.locator(
		`button[data-slot="${removePair.anchorSlot}"]`,
	)
	const removeNext = table.locator(`button[data-slot="${removePair.nextSlot}"]`)
	await removeAnchor.focus()
	await page.keyboard.press('Shift+ArrowRight')
	await expect.poll(() => getFocusedSlot(page)).toBe(removePair.nextSlot)
	await page.keyboard.press('Enter')
	await expect(removeAnchor).toHaveAttribute('aria-pressed', 'false')
	await expect(removeNext).toHaveAttribute('aria-pressed', 'false')
})

test('attendee schedule supports keyboard availability toggles', async ({
	page,
}) => {
	const { shareToken } = await createSchedule(page)

	await page.goto(`/s/${shareToken}`)
	await page.getByLabel('Your name').fill('Keyboard User')

	const table = page.locator('[data-schedule-grid-shell] table:visible').first()
	const slotButton = table
		.locator('button[data-slot]:not([aria-disabled="true"])')
		.first()
	await slotButton.focus()

	const initialPressed = await slotButton.getAttribute('aria-pressed')
	await page.keyboard.press('Enter')
	await expect
		.poll(() => slotButton.getAttribute('aria-pressed'))
		.not.toBe(initialPressed)
})

test('host unavailable grid supports keyboard shift-range blocking', async ({
	page,
}) => {
	const { shareToken, hostAccessToken } = await createSchedule(page)
	await page.goto(`/s/${shareToken}/${hostAccessToken}`)
	const hostUnavailableSection = page
		.getByRole('heading', { name: 'Host unavailable slots' })
		.locator('xpath=ancestor::section[1]')
	const table = hostUnavailableSection
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
	const unblockedPair = await findVerticalPair({ table, pressed: 'false' })
	const blockedPair = await findVerticalPair({ table, pressed: 'true' })
	const targetPair = unblockedPair ?? blockedPair
	const expectedPressed = unblockedPair ? 'true' : 'false'
	expect(targetPair).not.toBeNull()
	if (!targetPair) return
	const anchorButton = table.locator(
		`button[data-slot="${targetPair.anchorSlot}"]`,
	)
	const nextButton = table.locator(`button[data-slot="${targetPair.nextSlot}"]`)
	await anchorButton.focus()
	await page.keyboard.press('Shift+ArrowDown')
	await expect.poll(() => getFocusedSlot(page)).toBe(targetPair.nextSlot)
	await page.keyboard.press('Space')
	await expect(anchorButton).toHaveAttribute('aria-pressed', expectedPressed)
	await expect(nextButton).toHaveAttribute('aria-pressed', expectedPressed)
})
