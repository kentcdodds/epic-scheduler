import { expect, test } from '@playwright/test'

test('host submission cannot be deleted or renamed from attendee endpoints', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Your name').fill('Host')
	await page.getByRole('button', { name: 'Create share link' }).click()
	await expect(page).toHaveURL(/\/s\/[a-z0-9]+\/[a-z0-9]+$/i)
	const hostDashboardUrl = new URL(page.url())
	const shareToken =
		hostDashboardUrl.pathname.split('/').filter(Boolean)[1] ?? ''
	expect(shareToken).not.toBe('')

	await page.goto(`/s/${shareToken}?name=Host`)
	await expect(page.getByLabel('Your name')).toHaveValue('Host')
	await expect(
		page.getByRole('button', { name: 'Delete my submission' }),
	).toBeHidden()
	await expect(
		page.getByRole('button', { name: 'Change my name' }),
	).toBeHidden()

	const deleteResponse = await page.request.post(
		`/api/schedules/${shareToken}/submission-delete`,
		{
			data: { name: 'Host' },
		},
	)
	expect(deleteResponse.status()).toBe(403)
	const deletePayload = (await deleteResponse.json()) as {
		ok?: boolean
		error?: string
	}
	expect(deletePayload.ok).toBe(false)
	expect(typeof deletePayload.error).toBe('string')

	const renameResponse = await page.request.post(
		`/api/schedules/${shareToken}/submission-rename`,
		{
			data: { currentName: 'Host', nextName: 'Organizer' },
		},
	)
	expect(renameResponse.status()).toBe(403)
	const renamePayload = (await renameResponse.json()) as {
		ok?: boolean
		error?: string
	}
	expect(renamePayload.ok).toBe(false)
	expect(typeof renamePayload.error).toBe('string')

	const snapshotResponse = await page.request.get(
		`/api/schedules/${shareToken}`,
	)
	expect(snapshotResponse.ok()).toBe(true)
	const snapshotPayload = (await snapshotResponse.json()) as {
		ok?: boolean
		snapshot?: {
			attendees?: Array<{ name?: string }>
		}
	}
	expect(snapshotPayload.ok).toBe(true)
	const attendeeNames = (snapshotPayload.snapshot?.attendees ?? []).map(
		(attendee) => attendee.name ?? '',
	)
	expect(attendeeNames).toContain('Host')
	expect(attendeeNames).not.toContain('Organizer')
})
