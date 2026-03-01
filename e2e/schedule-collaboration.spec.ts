import { expect, test } from '@playwright/test'

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('attendee update appears in host schedule view', async ({
	browser,
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+/i)
	const hostChosenSlot = page.locator('button[aria-pressed="true"]').first()
	await expect(hostChosenSlot).toBeVisible()
	const hostLabel = (await hostChosenSlot.getAttribute('aria-label')) ?? ''
	const slotPrefixMatch = hostLabel.match(
		/^(.*?), (?:selected|not selected) for your availability,/,
	)
	const slotPrefix = slotPrefixMatch?.[1] ?? ''
	expect(slotPrefix.length).toBeGreaterThan(0)

	const hostUrl = page.url()
	const attendeeContext = await browser.newContext()
	const attendeePage = await attendeeContext.newPage()

	try {
		await attendeePage.goto(`${hostUrl}?name=Alex`)
		await attendeePage.getByLabel('Your name').fill('Alex')

		const candidateSlot = attendeePage.getByRole('button', {
			name: new RegExp(`^${escapeRegex(slotPrefix)}`),
		})
		await expect(candidateSlot).toBeVisible()
		await candidateSlot.click()
		await attendeePage
			.getByRole('button', { name: 'Save availability' })
			.click()
		await page.reload()
		const hostUpdatedSlot = page.getByRole('button', {
			name: new RegExp(`^${escapeRegex(slotPrefix)}`),
		})
		await expect(hostUpdatedSlot).toBeVisible()
		await expect(hostUpdatedSlot).toHaveAttribute('aria-label', /2 attendee/)
	} finally {
		await attendeeContext.close()
	}
})
