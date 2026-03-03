import { expect, test } from '@playwright/test'

test('home unselected slots become blocked on create', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')

	const unselectedSlotButton = page
		.locator('[data-schedule-grid-shell] table:visible')
		.first()
		.locator('button[aria-pressed="false"]')
		.first()
	await expect(unselectedSlotButton).toBeVisible()
	const initiallyUnselectedSlot =
		(await unselectedSlotButton.getAttribute('data-slot')) ?? ''
	expect(initiallyUnselectedSlot).not.toBe('')

	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const hostUrl = new URL(page.url())
	const shareToken = hostUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	const snapshotResponse = await page.request.get(
		`/api/schedules/${shareToken}`,
	)
	expect(snapshotResponse.ok()).toBe(true)
	const snapshotPayload = (await snapshotResponse.json()) as {
		ok?: boolean
		snapshot?: {
			blockedSlots?: Array<string>
		}
	}
	expect(snapshotPayload.ok).toBe(true)
	expect(snapshotPayload.snapshot?.blockedSlots ?? []).toContain(
		initiallyUnselectedSlot,
	)
})
