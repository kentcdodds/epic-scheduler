export type ScheduleIntervalMinutes = 15 | 30 | 60

export type ScheduleRecord = {
	id: string
	shareToken: string
	title: string
	intervalMinutes: ScheduleIntervalMinutes
	rangeStartUtc: string
	rangeEndUtc: string
	createdAt: string
}

export type AttendeeRecord = {
	id: string
	name: string
	isHost: boolean
	timeZone: string | null
}

export type ScheduleSnapshot = {
	schedule: ScheduleRecord
	slots: Array<string>
	blockedSlots: Array<string>
	attendees: Array<AttendeeRecord>
	availabilityByAttendee: Record<string, Array<string>>
	countsBySlot: Record<string, number>
	availableNamesBySlot: Record<string, Array<string>>
}

type PreparedStatementLike = {
	bind(...values: Array<unknown>): PreparedStatementLike
	run(): Promise<unknown>
	first<T = unknown>(): Promise<T | null>
	all<T = unknown>(): Promise<{ results: Array<T> }>
}

type D1DatabaseLike = {
	prepare(query: string): PreparedStatementLike
	batch?(statements: Array<PreparedStatementLike>): Promise<unknown>
}

type ScheduleInsertInput = {
	title: string
	intervalMinutes: number
	rangeStartUtc: string
	rangeEndUtc: string
	hostName: string
	hostTimeZone?: string | null
	selectedSlots: Array<string>
}

type UpsertAvailabilityInput = {
	shareToken: string
	attendeeName: string
	attendeeTimeZone?: string | null
	selectedSlots: Array<string>
	isHost?: boolean
}

type UpdateScheduleHostSettingsInput = {
	shareToken: string
	title?: string
	blockedSlots?: Array<string>
}

type ScheduleRow = {
	id: string
	share_token: string
	title: string
	interval_minutes: number
	range_start_utc: string
	range_end_utc: string
	created_at: string
}

type AttendeeRow = {
	id: string
	name: string
	is_host: number
	time_zone: string | null
}

type AvailabilityRow = {
	attendee_id: string
	slot_start_utc: string
}

type BlockedSlotRow = {
	slot_start_utc: string
}

export function createShareToken() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export function createHostAccessToken() {
	return crypto.randomUUID().replace(/-/g, '')
}

export function normalizeName(name: string) {
	return name.trim().replace(/\s+/g, ' ')
}

function normalizeNameForMatch(name: string) {
	return normalizeName(name).toLowerCase()
}

function parseUtcIso(value: string, fieldName: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid ${fieldName}. Expected an ISO date string.`)
	}
	return date.toISOString()
}

function normalizeTimeZone(
	value: string | null | undefined,
	fieldName: string,
) {
	const normalized = typeof value === 'string' ? value.trim() : ''
	if (!normalized) return null
	try {
		new Intl.DateTimeFormat('en-US', {
			timeZone: normalized,
			hour: 'numeric',
		}).format(new Date(0))
	} catch {
		throw new Error(`Invalid ${fieldName}.`)
	}
	return normalized
}

export function normalizeIntervalMinutes(
	value: number,
): ScheduleIntervalMinutes {
	if (value === 15 || value === 30 || value === 60) {
		return value
	}
	throw new Error('Interval must be one of 15, 30, or 60 minutes.')
}

export function buildSlots(params: {
	rangeStartUtc: string
	rangeEndUtc: string
	intervalMinutes: number
}) {
	const intervalMinutes = normalizeIntervalMinutes(params.intervalMinutes)
	const rangeStartUtc = parseUtcIso(params.rangeStartUtc, 'rangeStartUtc')
	const rangeEndUtc = parseUtcIso(params.rangeEndUtc, 'rangeEndUtc')
	const startMs = Date.parse(rangeStartUtc)
	const endMs = Date.parse(rangeEndUtc)

	if (endMs <= startMs) {
		throw new Error('rangeEndUtc must be later than rangeStartUtc.')
	}

	const intervalMs = intervalMinutes * 60_000
	const maxSlots = Math.ceil((endMs - startMs) / intervalMs)
	if (maxSlots > 24 * 31 * 4) {
		throw new Error('Requested range is too large.')
	}

	const slots: Array<string> = []
	for (let ms = startMs; ms < endMs; ms += intervalMs) {
		slots.push(new Date(ms).toISOString())
	}
	return slots
}

function normalizeSelectedSlots(params: {
	selectedSlots: Array<string>
	allowedSlots: ReadonlySet<string>
}) {
	const normalized = new Set<string>()
	for (const slot of params.selectedSlots) {
		const iso = parseUtcIso(slot, 'selectedSlots item')
		if (params.allowedSlots.has(iso)) {
			normalized.add(iso)
		}
	}
	return Array.from(normalized).sort((left, right) => left.localeCompare(right))
}

function toScheduleRecord(row: ScheduleRow): ScheduleRecord {
	return {
		id: row.id,
		shareToken: row.share_token,
		title: row.title,
		intervalMinutes: normalizeIntervalMinutes(row.interval_minutes),
		rangeStartUtc: row.range_start_utc,
		rangeEndUtc: row.range_end_utc,
		createdAt: row.created_at,
	}
}

async function insertAvailabilityRows(params: {
	db: D1DatabaseLike
	scheduleId: string
	attendeeId: string
	selectedSlots: Array<string>
}) {
	if (params.selectedSlots.length === 0) return

	const now = new Date().toISOString()
	const statements = params.selectedSlots.map((slot) =>
		params.db
			.prepare(
				`INSERT OR REPLACE INTO availability (
					schedule_id,
					attendee_id,
					slot_start_utc,
					updated_at
				)
				SELECT ?1, ?2, ?3, ?4
				WHERE NOT EXISTS (
					SELECT 1
					FROM schedule_blocked_slots
					WHERE schedule_id = ?1
						AND slot_start_utc = ?3
				)`,
			)
			.bind(params.scheduleId, params.attendeeId, slot, now),
	)
	if (typeof params.db.batch === 'function') {
		await params.db.batch(statements)
		return
	}

	for (const statement of statements) {
		await statement.run()
	}
}

async function insertBlockedSlotRows(params: {
	db: D1DatabaseLike
	scheduleId: string
	blockedSlots: Array<string>
}) {
	if (params.blockedSlots.length === 0) return

	const now = new Date().toISOString()
	const statements = params.blockedSlots.map((slot) =>
		params.db
			.prepare(
				`INSERT OR REPLACE INTO schedule_blocked_slots (
					schedule_id,
					slot_start_utc,
					updated_at
				) VALUES (?1, ?2, ?3)`,
			)
			.bind(params.scheduleId, slot, now),
	)
	if (typeof params.db.batch === 'function') {
		await params.db.batch(statements)
		return
	}

	for (const statement of statements) {
		await statement.run()
	}
}

async function getBlockedSlotsForScheduleId(
	db: D1DatabaseLike,
	scheduleId: string,
) {
	const blockedRows = await db
		.prepare(
			`SELECT
				slot_start_utc
			FROM schedule_blocked_slots
			WHERE schedule_id = ?1`,
		)
		.bind(scheduleId)
		.all<BlockedSlotRow>()
	return blockedRows.results.map((row) => row.slot_start_utc)
}

export async function getScheduleByShareToken(
	db: D1DatabaseLike,
	shareToken: string,
) {
	const row = await db
		.prepare(
			`SELECT
				id,
				share_token,
				title,
				interval_minutes,
				range_start_utc,
				range_end_utc,
				created_at
			FROM schedules
			WHERE share_token = ?1
			LIMIT 1`,
		)
		.bind(shareToken)
		.first<ScheduleRow>()
	if (!row) return null
	return toScheduleRecord(row)
}

export async function getScheduleHostAccessToken(
	db: D1DatabaseLike,
	shareToken: string,
) {
	const row = await db
		.prepare(
			`SELECT
				host_access_token
			FROM schedules
			WHERE share_token = ?1
			LIMIT 1`,
		)
		.bind(shareToken)
		.first<{ host_access_token: string }>()
	if (!row?.host_access_token) return null
	return row.host_access_token
}

export async function createSchedule(
	db: D1DatabaseLike,
	input: ScheduleInsertInput,
) {
	const intervalMinutes = normalizeIntervalMinutes(input.intervalMinutes)
	const title = input.title.trim() || 'New schedule'
	const hostName = normalizeName(input.hostName)
	if (!hostName) {
		throw new Error('Host name is required.')
	}

	const slots = buildSlots({
		rangeStartUtc: input.rangeStartUtc,
		rangeEndUtc: input.rangeEndUtc,
		intervalMinutes,
	})
	const allowedSlotSet = new Set(slots)
	const selectedSlots = normalizeSelectedSlots({
		selectedSlots: input.selectedSlots,
		allowedSlots: allowedSlotSet,
	})

	const id = crypto.randomUUID()
	const shareToken = createShareToken()
	const hostAccessToken = createHostAccessToken()
	const hostAttendeeId = crypto.randomUUID()
	const createdAt = new Date().toISOString()
	const nameNorm = normalizeNameForMatch(hostName)
	const hostTimeZone = normalizeTimeZone(input.hostTimeZone, 'hostTimeZone')

	await db
		.prepare(
			`INSERT INTO schedules (
				id,
				share_token,
				host_access_token,
				title,
				interval_minutes,
				range_start_utc,
				range_end_utc,
				created_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
		)
		.bind(
			id,
			shareToken,
			hostAccessToken,
			title,
			intervalMinutes,
			slots[0],
			new Date(
				Date.parse(slots[slots.length - 1]!) + intervalMinutes * 60_000,
			).toISOString(),
			createdAt,
		)
		.run()

	await db
		.prepare(
			`INSERT INTO attendees (
				id,
				schedule_id,
				name,
				name_norm,
				is_host,
				time_zone,
				created_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
		)
		.bind(hostAttendeeId, id, hostName, nameNorm, 1, hostTimeZone, createdAt)
		.run()

	await insertAvailabilityRows({
		db,
		scheduleId: id,
		attendeeId: hostAttendeeId,
		selectedSlots,
	})

	return {
		scheduleId: id,
		shareToken,
		hostAccessToken,
		hostAttendeeId,
	}
}

export async function upsertAttendeeAvailability(
	db: D1DatabaseLike,
	input: UpsertAvailabilityInput,
) {
	const schedule = await getScheduleByShareToken(db, input.shareToken)
	if (!schedule) {
		throw new Error('Schedule not found.')
	}

	const attendeeName = normalizeName(input.attendeeName)
	if (!attendeeName) {
		throw new Error('Attendee name is required.')
	}

	const allowedSlots = new Set(
		buildSlots({
			rangeStartUtc: schedule.rangeStartUtc,
			rangeEndUtc: schedule.rangeEndUtc,
			intervalMinutes: schedule.intervalMinutes,
		}),
	)
	const blockedSlots = await getBlockedSlotsForScheduleId(db, schedule.id)
	for (const blockedSlot of blockedSlots) {
		allowedSlots.delete(blockedSlot)
	}
	const selectedSlots = normalizeSelectedSlots({
		selectedSlots: input.selectedSlots,
		allowedSlots,
	})
	const nameNorm = normalizeNameForMatch(attendeeName)
	const attendeeTimeZone = normalizeTimeZone(
		input.attendeeTimeZone,
		'attendeeTimeZone',
	)

	let attendee = await db
		.prepare(
			`SELECT id
			FROM attendees
			WHERE schedule_id = ?1
				AND name_norm = ?2
			LIMIT 1`,
		)
		.bind(schedule.id, nameNorm)
		.first<{ id: string }>()

	if (!attendee) {
		const attendeeId = crypto.randomUUID()
		await db
			.prepare(
				`INSERT INTO attendees (
					id,
					schedule_id,
					name,
					name_norm,
					is_host,
					time_zone,
					created_at
				) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
			)
			.bind(
				attendeeId,
				schedule.id,
				attendeeName,
				nameNorm,
				input.isHost ? 1 : 0,
				attendeeTimeZone,
				new Date().toISOString(),
			)
			.run()
		attendee = { id: attendeeId }
	}

	await db
		.prepare(
			`UPDATE attendees
			SET name = ?2,
				time_zone = COALESCE(?3, time_zone)
			WHERE id = ?1`,
		)
		.bind(attendee.id, attendeeName, attendeeTimeZone)
		.run()

	await db
		.prepare(
			`DELETE FROM availability
			WHERE attendee_id = ?1`,
		)
		.bind(attendee.id)
		.run()

	await insertAvailabilityRows({
		db,
		scheduleId: schedule.id,
		attendeeId: attendee.id,
		selectedSlots,
	})

	return {
		scheduleId: schedule.id,
		attendeeId: attendee.id,
	}
}

export async function updateScheduleHostSettings(
	db: D1DatabaseLike,
	input: UpdateScheduleHostSettingsInput,
) {
	const schedule = await getScheduleByShareToken(db, input.shareToken)
	if (!schedule) {
		throw new Error('Schedule not found.')
	}

	const updates: Array<PreparedStatementLike> = []
	if (typeof input.title === 'string') {
		const normalizedTitle = input.title.trim() || 'New schedule'
		updates.push(
			db
				.prepare(
					`UPDATE schedules
					SET title = ?2
					WHERE id = ?1`,
				)
				.bind(schedule.id, normalizedTitle),
		)
	}

	let normalizedBlockedSlots: Array<string> | null = null
	if (Array.isArray(input.blockedSlots)) {
		const allowedSlots = new Set(
			buildSlots({
				rangeStartUtc: schedule.rangeStartUtc,
				rangeEndUtc: schedule.rangeEndUtc,
				intervalMinutes: schedule.intervalMinutes,
			}),
		)
		normalizedBlockedSlots = normalizeSelectedSlots({
			selectedSlots: input.blockedSlots,
			allowedSlots,
		})

		updates.push(
			db
				.prepare(
					`DELETE FROM schedule_blocked_slots
					WHERE schedule_id = ?1`,
				)
				.bind(schedule.id),
		)
	}

	if (updates.length > 0) {
		if (typeof db.batch === 'function') {
			await db.batch(updates)
		} else {
			for (const statement of updates) {
				await statement.run()
			}
		}
	}

	if (normalizedBlockedSlots !== null) {
		await insertBlockedSlotRows({
			db,
			scheduleId: schedule.id,
			blockedSlots: normalizedBlockedSlots,
		})

		if (normalizedBlockedSlots.length > 0) {
			const deleteStatements = normalizedBlockedSlots.map((slot) =>
				db
					.prepare(
						`DELETE FROM availability
						WHERE schedule_id = ?1
							AND slot_start_utc = ?2`,
					)
					.bind(schedule.id, slot),
			)
			if (typeof db.batch === 'function') {
				await db.batch(deleteStatements)
			} else {
				for (const statement of deleteStatements) {
					await statement.run()
				}
			}
		}
	}

	return { scheduleId: schedule.id }
}

export async function getScheduleSnapshot(
	db: D1DatabaseLike,
	shareToken: string,
): Promise<ScheduleSnapshot | null> {
	const schedule = await getScheduleByShareToken(db, shareToken)
	if (!schedule) return null

	const slots = buildSlots({
		rangeStartUtc: schedule.rangeStartUtc,
		rangeEndUtc: schedule.rangeEndUtc,
		intervalMinutes: schedule.intervalMinutes,
	})
	const validSlots = new Set(slots)
	const blockedSlotsSet = new Set(
		(await getBlockedSlotsForScheduleId(db, schedule.id)).filter((slot) =>
			validSlots.has(slot),
		),
	)
	const blockedSlots = Array.from(blockedSlotsSet).sort((left, right) =>
		left.localeCompare(right),
	)

	const attendeeRows = await db
		.prepare(
			`SELECT
				id,
				name,
				is_host,
				time_zone
			FROM attendees
			WHERE schedule_id = ?1
			ORDER BY created_at ASC`,
		)
		.bind(schedule.id)
		.all<AttendeeRow>()

	const availabilityRows = await db
		.prepare(
			`SELECT
				attendee_id,
				slot_start_utc
			FROM availability
			WHERE schedule_id = ?1`,
		)
		.bind(schedule.id)
		.all<AvailabilityRow>()

	const attendees = attendeeRows.results.map((row: AttendeeRow) => ({
		id: row.id,
		name: row.name,
		isHost: row.is_host === 1,
		timeZone: row.time_zone ?? null,
	}))
	const attendeeNameById = new Map(
		attendees.map((attendee: AttendeeRecord) => [attendee.id, attendee.name]),
	)

	const availabilityByAttendee: Record<string, Array<string>> = {}
	for (const attendee of attendees) {
		availabilityByAttendee[attendee.id] = []
	}

	const countsBySlot: Record<string, number> = Object.fromEntries(
		slots.map((slot) => [slot, 0]),
	)
	const availableNamesBySlot: Record<
		string,
		Array<string>
	> = Object.fromEntries(slots.map((slot) => [slot, []]))

	for (const row of availabilityRows.results) {
		if (!validSlots.has(row.slot_start_utc)) continue
		if (blockedSlotsSet.has(row.slot_start_utc)) continue
		if (!availabilityByAttendee[row.attendee_id]) {
			availabilityByAttendee[row.attendee_id] = []
		}
		availabilityByAttendee[row.attendee_id]!.push(row.slot_start_utc)
		countsBySlot[row.slot_start_utc] =
			(countsBySlot[row.slot_start_utc] ?? 0) + 1
		const attendeeName = attendeeNameById.get(row.attendee_id)
		if (attendeeName) {
			availableNamesBySlot[row.slot_start_utc]!.push(attendeeName)
		}
	}

	for (const slot of slots) {
		availableNamesBySlot[slot]!.sort((left, right) => left.localeCompare(right))
	}

	return {
		schedule,
		slots,
		blockedSlots,
		attendees,
		availabilityByAttendee,
		countsBySlot,
		availableNamesBySlot,
	}
}
