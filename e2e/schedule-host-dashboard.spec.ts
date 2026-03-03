import { expect, test } from '@playwright/test'

function parseHostRouteTokens(url: string) {
	const scheduleUrl = new URL(url)
	const segments = scheduleUrl.pathname.split('/').filter(Boolean)
	return {
		shareToken: segments[1] ?? '',
		hostAccessToken: segments[2] ?? '',
	}
}

test('host dashboard can update host name', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host Original')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const { shareToken, hostAccessToken } = parseHostRouteTokens(page.url())
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')
	if (!shareToken || !hostAccessToken) {
		throw new Error('Expected host route share and access tokens.')
	}

	const hostNameInput = page.getByLabel('Host name')
	await expect(hostNameInput).toHaveValue('Host Original')
	await hostNameInput.fill('Host Renamed')

	await expect
		.poll(
			async () => {
				const response = await page.request.get(
					`/api/schedules/${shareToken}/host-snapshot`,
					{
						headers: {
							'X-Host-Token': hostAccessToken,
						},
					},
				)
				if (!response.ok()) return ''
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string; isHost?: boolean }>
					}
				}
				if (!payload.ok || !payload.snapshot) return ''
				const hostAttendee = payload.snapshot.attendees?.find(
					(attendee) => attendee.isHost,
				)
				return hostAttendee?.name ?? ''
			},
			{ timeout: 12_000 },
		)
		.toBe('Host Renamed')

	await page.reload()
	await expect(page.getByLabel('Host name')).toHaveValue('Host Renamed')
})

test('host dashboard can rename an attendee from edit mode', async ({
	browser,
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Schedule title').fill('Team sync')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)

	const { shareToken, hostAccessToken } = parseHostRouteTokens(page.url())
	expect(shareToken).not.toBe('')
	expect(hostAccessToken).not.toBe('')
	if (!shareToken || !hostAccessToken) {
		throw new Error('Expected host route share and access tokens.')
	}

	const attendeeContext = await browser.newContext()
	const attendeePage = await attendeeContext.newPage()

	try {
		await attendeePage.goto(`/s/${shareToken}?name=Alex`)
		await attendeePage.getByLabel('Your name').fill('Alex')
		const attendeeSlot = attendeePage
			.locator('[data-schedule-grid-shell] table:visible')
			.first()
			.locator('button')
			.first()
		await expect(attendeeSlot).toBeVisible()
		await attendeeSlot.click()

		await expect
			.poll(
				async () => {
					const response = await page.request.get(
						`/api/schedules/${shareToken}/host-snapshot`,
						{
							headers: {
								'X-Host-Token': hostAccessToken,
							},
						},
					)
					if (!response.ok()) return false
					const payload = (await response.json()) as {
						ok?: boolean
						snapshot?: {
							attendees?: Array<{ name?: string; isHost?: boolean }>
						}
					}
					if (!payload.ok || !payload.snapshot) return false
					return !!payload.snapshot.attendees?.some(
						(attendee) => attendee.name === 'Alex' && !attendee.isHost,
					)
				},
				{ timeout: 12_000 },
			)
			.toBe(true)
	} finally {
		await attendeeContext.close()
	}

	await page.getByLabel('Edit submission for Alex').click()
	const attendeeNameInput = page.getByLabel('Submission name input for Alex')
	await expect(attendeeNameInput).toBeVisible()
	await attendeeNameInput.fill('Alex Renamed')
	await page.getByLabel('Update submission name for Alex').click()

	await expect
		.poll(
			async () => {
				const response = await page.request.get(
					`/api/schedules/${shareToken}/host-snapshot`,
					{
						headers: {
							'X-Host-Token': hostAccessToken,
						},
					},
				)
				if (!response.ok()) return false
				const payload = (await response.json()) as {
					ok?: boolean
					snapshot?: {
						attendees?: Array<{ name?: string; isHost?: boolean }>
					}
				}
				if (!payload.ok || !payload.snapshot) return false
				return !!payload.snapshot.attendees?.some(
					(attendee) => attendee.name === 'Alex Renamed' && !attendee.isHost,
				)
			},
			{ timeout: 12_000 },
		)
		.toBe(true)

	await page.reload()
	await expect(page.getByText('Alex Renamed')).toBeVisible()
})
