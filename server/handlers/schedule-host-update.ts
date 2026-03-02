import { type BuildAction } from 'remix/fetch-router'
import {
	getScheduleSnapshot,
	updateScheduleHostSettings,
} from '#shared/schedule-store.ts'
import { type AppEnv } from '#types/env-schema.ts'
import { type routes } from '#server/routes.ts'

type HostUpdateRequest = {
	title?: unknown
	blockedSlots?: unknown
}

function getShareToken(pathname: string) {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length < 3) return ''
	return segments[2] ?? ''
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toOptionalString(value: unknown) {
	return typeof value === 'string' ? value : undefined
}

function toOptionalStringArray(value: unknown) {
	if (value === undefined) return undefined
	if (!Array.isArray(value)) return undefined
	return value.filter((item): item is string => typeof item === 'string')
}

function isHostUpdateValidationError(message: string) {
	return /(not found|required|invalid|must|range|interval|too large)/i.test(
		message,
	)
}

export function createScheduleHostUpdateHandler(
	appEnv: Pick<AppEnv, 'APP_DB' | 'SCHEDULE_ROOM'>,
) {
	return {
		middleware: [],
		async action({ request, url }) {
			const shareToken = getShareToken(url.pathname)
			if (!shareToken) {
				return Response.json(
					{ ok: false, error: 'Missing schedule token.' },
					{ status: 400 },
				)
			}

			let body: HostUpdateRequest
			try {
				const parsed = await request.json()
				if (!isRecordValue(parsed)) {
					return Response.json(
						{ ok: false, error: 'Invalid JSON payload.' },
						{ status: 400 },
					)
				}
				body = parsed as HostUpdateRequest
			} catch {
				return Response.json(
					{ ok: false, error: 'Invalid JSON payload.' },
					{ status: 400 },
				)
			}

			if (body.title !== undefined && typeof body.title !== 'string') {
				return Response.json(
					{ ok: false, error: 'title must be a string.' },
					{ status: 400 },
				)
			}
			if (
				body.blockedSlots !== undefined &&
				!Array.isArray(body.blockedSlots)
			) {
				return Response.json(
					{ ok: false, error: 'blockedSlots must be an array of strings.' },
					{ status: 400 },
				)
			}

			try {
				await updateScheduleHostSettings(appEnv.APP_DB, {
					shareToken,
					title: toOptionalString(body.title),
					blockedSlots: toOptionalStringArray(body.blockedSlots),
				})
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Unable to update schedule host settings.'
				if (isHostUpdateValidationError(message)) {
					return Response.json({ ok: false, error: message }, { status: 400 })
				}
				console.error('schedule host update failed:', error)
				return Response.json(
					{ ok: false, error: 'Unable to update schedule host settings.' },
					{ status: 500 },
				)
			}

			const snapshot = await getScheduleSnapshot(appEnv.APP_DB, shareToken)
			if (!snapshot) {
				return Response.json(
					{ ok: false, error: 'Schedule not found.' },
					{ status: 404 },
				)
			}

			const roomId = appEnv.SCHEDULE_ROOM.idFromName(shareToken)
			const room = appEnv.SCHEDULE_ROOM.get(roomId)
			void room.fetch('https://schedule-room/broadcast', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'schedule-updated',
					shareToken,
					updatedAt: new Date().toISOString(),
				}),
			})

			return Response.json({ ok: true, snapshot })
		},
	} satisfies BuildAction<
		typeof routes.scheduleHostUpdate.method,
		typeof routes.scheduleHostUpdate.pattern
	>
}
