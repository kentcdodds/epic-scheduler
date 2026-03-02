import { expect, test } from '@playwright/test'

test('drag painting stops when mouse is released on a blocked slot', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const urlSegments = new URL(page.url()).pathname.split('/').filter(Boolean)
	const shareToken = urlSegments[1] ?? ''
	const hostAccessToken = urlSegments[2] ?? ''
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')

	await page.goto(`/s/${shareToken}?name=Host`)
	const table = page.locator('[data-schedule-grid-shell] table:visible').first()
	await expect(table).toBeVisible()

	const initiallySelectedButton = table
		.locator('button[aria-pressed="true"]:not([aria-disabled="true"])')
		.first()
	await expect(initiallySelectedButton).toBeVisible()

	const blockedSlot = await initiallySelectedButton.getAttribute('data-slot')
	expect(blockedSlot).toBeTruthy()
	if (!blockedSlot) {
		throw new Error('Expected a selected slot to block.')
	}

	const blockResponse = await page.request.post(
		`/api/schedules/${shareToken}/host`,
		{
			headers: {
				'Content-Type': 'application/json',
				'X-Host-Token': hostAccessToken,
			},
			data: {
				blockedSlots: [blockedSlot],
			},
		},
	)
	expect(blockResponse.ok()).toBe(true)

	await page.reload()
	const reloadedTable = page
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
	await expect(reloadedTable).toBeVisible()

	const blockedButton = reloadedTable.locator(
		`button[data-slot="${blockedSlot}"]`,
	)
	await expect(blockedButton).toBeVisible()
	await expect(blockedButton).toHaveAttribute('aria-disabled', 'true')

	const dragStartButton = reloadedTable
		.locator('button[aria-pressed="true"]:not([aria-disabled="true"])')
		.first()
	const dragTargetButton = reloadedTable
		.locator('button[aria-pressed="false"]:not([aria-disabled="true"])')
		.first()

	await expect(dragStartButton).toBeVisible()
	await expect(dragTargetButton).toBeVisible()

	const targetPressedBefore =
		await dragTargetButton.getAttribute('aria-pressed')
	await dragStartButton.hover()
	await page.mouse.down()
	await blockedButton.hover()
	await page.mouse.up()
	await dragTargetButton.hover()
	const targetPressedAfter = await dragTargetButton.getAttribute('aria-pressed')

	expect(targetPressedAfter).toBe(targetPressedBefore)
})
