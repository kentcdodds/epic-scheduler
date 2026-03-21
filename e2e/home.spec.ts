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

	const firstGridCell = page
		.locator('[data-schedule-grid-scroller] table button')
		.first()
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
		.locator(
			'[data-schedule-grid-shell] thead th[data-schedule-grid-day-header]',
		)
		.first()
	await expect(dateHeaderCell).toBeVisible()

	const gridBox = await grid.boundingBox()
	expect(gridBox).not.toBeNull()
	if (!gridBox) {
		throw new Error('Expected schedule grid to be measurable.')
	}

	await page.evaluate(
		(targetScrollY) => {
			window.scrollTo({ top: targetScrollY, behavior: 'instant' })
		},
		Math.max(0, gridBox.y + 120),
	)

	const stickyHeaderTop = await dateHeaderCell.evaluate((element) => {
		return Math.round(element.getBoundingClientRect().top)
	})
	expect(stickyHeaderTop).toBeGreaterThanOrEqual(0)
	expect(stickyHeaderTop).toBeLessThanOrEqual(48)
})

test('desktop date header stays sticky while page scrolls', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	await page.goto('/')

	const grid = page.locator('[data-schedule-grid-shell]').first()
	await expect(grid).toBeVisible()

	const dateHeaderCell = page
		.locator(
			'[data-schedule-grid-shell] thead th[data-schedule-grid-day-header]',
		)
		.first()
	await expect(dateHeaderCell).toBeVisible()

	const gridBox = await grid.boundingBox()
	expect(gridBox).not.toBeNull()
	if (!gridBox) {
		throw new Error('Expected schedule grid to be measurable.')
	}

	await page.evaluate(
		(targetScrollY) => {
			window.scrollTo({ top: targetScrollY, behavior: 'instant' })
		},
		Math.max(0, gridBox.y + 120),
	)

	const stickyHeaderTop = await dateHeaderCell.evaluate((element) => {
		return Math.round(element.getBoundingClientRect().top)
	})
	expect(stickyHeaderTop).toBeGreaterThanOrEqual(0)
	expect(stickyHeaderTop).toBeLessThanOrEqual(48)
})

test('mobile long date ranges keep page width constrained', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	await page.getByLabel('End date').fill('2026-04-20')

	const pageWidths = await page.evaluate(() => {
		return {
			innerWidth: window.innerWidth,
			scrollWidth: document.documentElement.scrollWidth,
		}
	})
	expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.innerWidth + 1)

	const scrollerWidths = await page
		.locator('[data-schedule-grid-scroller]')
		.first()
		.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
		}))
	expect(scrollerWidths.scrollWidth).toBeGreaterThan(scrollerWidths.clientWidth)
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
	const firstGridCell = page
		.locator('[data-schedule-grid-scroller] table button')
		.first()
	await expect(firstGridCell).toBeVisible()
	await firstGridCell.click()
	await expect(selectedCount).toContainText('1 selected slot')

	await page.getByLabel('Slot interval').selectOption('30')
	await expect(selectedCount).toContainText('2 selected slots')
})

test('mobile blocked slot tap updates active ring and details', async ({
	browser,
	request,
}) => {
	const hourMs = 3_600_000
	const dayMs = 24 * hourMs
	const rangeStart = new Date(Math.ceil(Date.now() / hourMs) * hourMs + hourMs)
	const blockedSlot = rangeStart.toISOString()
	const editableSlot = new Date(rangeStart.getTime() + hourMs).toISOString()
	const visiblePeerSlot = new Date(rangeStart.getTime() + dayMs).toISOString()
	const rangeEnd = new Date(rangeStart.getTime() + dayMs + hourMs)

	const createResponse = await request.post('/api/schedules', {
		data: {
			title: 'Blocked slot focus feedback',
			hostName: 'Host',
			hostTimeZone: 'UTC',
			intervalMinutes: 60,
			rangeStartUtc: rangeStart.toISOString(),
			rangeEndUtc: rangeEnd.toISOString(),
			selectedSlots: [],
			blockedSlots: [blockedSlot],
		},
	})
	expect(createResponse.ok()).toBe(true)
	const createPayload = (await createResponse.json()) as {
		ok?: boolean
		shareToken?: string
	}
	expect(createPayload.ok).toBe(true)
	if (
		typeof createPayload.shareToken !== 'string' ||
		createPayload.shareToken.trim().length === 0
	) {
		throw new Error('Expected /api/schedules to return a non-empty shareToken')
	}

	const context = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 },
	})

	try {
		const mobilePage = await context.newPage()
		const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8788'
		async function tapSlotButton(
			button: Awaited<ReturnType<typeof mobilePage.locator>>,
		) {
			// Keep the raw touch tap so blocked cells remain tappable in the test.
			await button.evaluate((element) => {
				element.scrollIntoView({
					block: 'center',
					inline: 'center',
				})
			})
			const box = await button.boundingBox()
			if (!box) {
				throw new Error('Expected tapped slot button to have a bounding box.')
			}
			await mobilePage.touchscreen.tap(
				box.x + box.width / 2,
				box.y + box.height / 2,
			)
		}

		await mobilePage.goto(
			`${baseUrl}/s/${createPayload.shareToken}?name=${encodeURIComponent('Alex')}`,
		)

		await expect(
			mobilePage.getByRole('heading', { name: 'Blocked slot focus feedback' }),
		).toBeVisible()

		const blockedSlotButton = mobilePage.locator(
			`button[data-slot="${blockedSlot}"]`,
		)
		const editableSlotButton = mobilePage.locator(
			`button[data-slot="${editableSlot}"]`,
		)
		const visiblePeerSlotButton = mobilePage.locator(
			`button[data-slot="${visiblePeerSlot}"]`,
		)
		await expect(blockedSlotButton).toBeVisible()
		await expect(editableSlotButton).toBeVisible()
		await expect(visiblePeerSlotButton).toBeVisible()

		const blockedSlotTitle = await blockedSlotButton.getAttribute('title')
		if (!blockedSlotTitle) {
			throw new Error('Expected blocked slot button to expose a title label.')
		}
		const blockedSlotLabel = blockedSlotTitle.split('\n')[0]
		const editableSlotTitle = await editableSlotButton.getAttribute('title')
		if (!editableSlotTitle) {
			throw new Error('Expected editable slot button to expose a title label.')
		}
		const editableSlotLabel = editableSlotTitle.split('\n')[0]
		const slotDetails = mobilePage
			.locator('section')
			.filter({
				has: mobilePage.getByRole('heading', { name: 'Slot details' }),
			})
			.first()

		await tapSlotButton(editableSlotButton)
		await expect(slotDetails).toContainText(editableSlotLabel)
		await tapSlotButton(blockedSlotButton)

		await expect(slotDetails).toContainText(blockedSlotLabel)
		await expect(slotDetails).toContainText(
			'This slot is unavailable because the host blocked it.',
		)
		await expect
			.poll(() =>
				blockedSlotButton.evaluate((element) =>
					getComputedStyle(element).boxShadow.includes('inset'),
				),
			)
			.toBe(true)
		await expect
			.poll(() =>
				editableSlotButton.evaluate(
					(element) => getComputedStyle(element).boxShadow !== 'none',
				),
			)
			.toBe(false)
	} finally {
		await context.close()
	}
})
