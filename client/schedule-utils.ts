import { normalizeName } from '#shared/schedule-store.ts'

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
	const [rawYear, rawMonth, rawDay] = dateInput.split('-')
	if (!rawYear || !rawMonth || !rawDay) return null
	const year = Number.parseInt(rawYear, 10)
	const month = Number.parseInt(rawMonth, 10)
	const day = Number.parseInt(rawDay, 10)
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	)
		return null
	if (month < 1 || month > 12 || day < 1 || day > 31) return null
	const date = new Date(year, month - 1, day, 0, 0, 0, 0)
	if (Number.isNaN(date.getTime())) return null
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null
	}
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

export function toDayKey(slot: string | null) {
	if (!slot) return null
	const date = new Date(slot)
	if (Number.isNaN(date.getTime())) return null
	return formatDayKey(date)
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

	const intervalMs = interval * 60_000
	const maxSlots = 24 * 31 * 4
	const estimatedSlots = Math.ceil((endMs - startMs) / intervalMs)
	if (estimatedSlots > maxSlots) {
		throw new Error('Requested range is too large.')
	}

	const slots: Array<string> = []
	for (let value = startMs; value < endMs; value += intervalMs) {
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

const attendeeLocalTimeFormatters = new Map<string, Intl.DateTimeFormat>()

export function formatSlotForAttendeeTimeZone(
	slot: string,
	timeZone: string | null,
) {
	if (!timeZone) {
		return {
			localTime: 'Local time unknown',
			timeZoneLabel: 'timezone unknown',
		}
	}
	const slotDate = new Date(slot)
	if (Number.isNaN(slotDate.getTime())) {
		return { localTime: 'Local time unknown', timeZoneLabel: timeZone }
	}
	try {
		let formatter = attendeeLocalTimeFormatters.get(timeZone)
		if (!formatter) {
			formatter = new Intl.DateTimeFormat(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				timeZone,
			})
			attendeeLocalTimeFormatters.set(timeZone, formatter)
		}
		return {
			localTime: formatter.format(slotDate),
			timeZoneLabel: timeZone,
		}
	} catch {
		return { localTime: 'Local time unknown', timeZoneLabel: timeZone }
	}
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
