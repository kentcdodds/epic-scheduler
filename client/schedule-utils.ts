export type GridModel = {
	dayKeys: Array<string>
	dayLabels: Record<string, string>
	timeKeys: Array<string>
	timeLabels: Record<string, string>
	cellByDayAndTime: Record<string, Record<string, string>>
}

function pad(value: number) {
	return String(value).padStart(2, '0')
}

function formatDayKey(date: Date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatTimeKey(date: Date) {
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseDateInputToLocalDate(dateInput: string) {
	const [year, month, day] = dateInput
		.split('-')
		.map((part) => Number.parseInt(part, 10))
	if (!year || !month || !day) return null
	const date = new Date(year, month - 1, day, 0, 0, 0, 0)
	if (Number.isNaN(date.getTime())) return null
	return date
}

export function formatDateInputValue(date: Date) {
	return formatDayKey(date)
}

export function addDays(date: Date, days: number) {
	const next = new Date(date.getTime())
	next.setDate(next.getDate() + days)
	return next
}

export function createSlotRangeFromDateInputs(params: {
	startDateInput: string
	endDateInput: string
	intervalMinutes: number
}) {
	const startDate = parseDateInputToLocalDate(params.startDateInput)
	const endDate = parseDateInputToLocalDate(params.endDateInput)
	if (!startDate || !endDate) {
		throw new Error('Invalid date range.')
	}

	const interval = params.intervalMinutes
	if (interval !== 15 && interval !== 30 && interval !== 60) {
		throw new Error('Interval must be 15, 30, or 60.')
	}

	const startMs = startDate.getTime()
	const endExclusive = addDays(endDate, 1)
	const endMs = endExclusive.getTime()
	if (endMs <= startMs) {
		throw new Error('End date must be after start date.')
	}

	const slots: Array<string> = []
	for (let value = startMs; value < endMs; value += interval * 60_000) {
		slots.push(new Date(value).toISOString())
	}

	return {
		rangeStartUtc: new Date(startMs).toISOString(),
		rangeEndUtc: new Date(endMs).toISOString(),
		slots,
	}
}

export function buildGridModel(slots: Array<string>): GridModel {
	const dayKeys: Array<string> = []
	const dayLabels: Record<string, string> = {}
	const timeKeys: Array<string> = []
	const timeLabels: Record<string, string> = {}
	const cellByDayAndTime: Record<string, Record<string, string>> = {}
	const timeSeen = new Set<string>()

	for (const slot of slots) {
		const date = new Date(slot)
		if (Number.isNaN(date.getTime())) continue

		const dayKey = formatDayKey(date)
		const timeKey = formatTimeKey(date)

		if (!cellByDayAndTime[dayKey]) {
			cellByDayAndTime[dayKey] = {}
			dayKeys.push(dayKey)
			dayLabels[dayKey] = new Intl.DateTimeFormat(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
			}).format(date)
		}

		if (!timeSeen.has(timeKey)) {
			timeSeen.add(timeKey)
			timeKeys.push(timeKey)
			timeLabels[timeKey] = new Intl.DateTimeFormat(undefined, {
				hour: 'numeric',
				minute: '2-digit',
			}).format(date)
		}

		cellByDayAndTime[dayKey]![timeKey] = slot
	}

	timeKeys.sort((left, right) => left.localeCompare(right))
	dayKeys.sort((left, right) => left.localeCompare(right))

	return {
		dayKeys,
		dayLabels,
		timeKeys,
		timeLabels,
		cellByDayAndTime,
	}
}

export function normalizeName(value: string) {
	return value.trim().replace(/\s+/g, ' ')
}

export function findSelectionForAttendee(params: {
	attendeeName: string
	attendees: Array<{ id: string; name: string }>
	availabilityByAttendee: Record<string, Array<string>>
}) {
	const target = normalizeName(params.attendeeName).toLowerCase()
	if (!target) return []
	const match = params.attendees.find(
		(attendee) => normalizeName(attendee.name).toLowerCase() === target,
	)
	if (!match) return []
	return params.availabilityByAttendee[match.id] ?? []
}
