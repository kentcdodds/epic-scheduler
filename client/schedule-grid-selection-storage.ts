/**
 * Persists schedule grid slot selections (and the homepage create form) in
 * sessionStorage so state survives refresh and same-tab back/forward navigation.
 */

const STORAGE_VERSION = 'v1'
const KEY_PREFIX = `epic-scheduler:grid-selection:${STORAGE_VERSION}:`

export const HOME_CREATE_FORM_STORAGE_KEY = `${KEY_PREFIX}home-create-form`

export type HomeCreateFormSnapshot = {
	title: string
	hostName: string
	intervalMinutes: number
	startDateInput: string
	endDateInput: string
	selectedSlotIds: Array<string>
}

function safeSessionStorage(): Storage | null {
	if (typeof sessionStorage === 'undefined') return null
	try {
		return sessionStorage
	} catch {
		return null
	}
}

export function gridSelectionStorageKeyHome(params: {
	rangeStartUtc: string
	rangeEndUtc: string
	intervalMinutes: number
}) {
	const { rangeStartUtc, rangeEndUtc, intervalMinutes } = params
	return `${KEY_PREFIX}home:${encodeURIComponent(rangeStartUtc)}:${encodeURIComponent(rangeEndUtc)}:${intervalMinutes}`
}

export function gridSelectionStorageKeyAttendee(params: {
	shareToken: string
	attendeeNameLookup: string
}) {
	const { shareToken, attendeeNameLookup } = params
	return `${KEY_PREFIX}attendee:${encodeURIComponent(shareToken)}:${encodeURIComponent(attendeeNameLookup)}`
}

export function gridSelectionStorageKeyHostBlocked(shareToken: string) {
	return `${KEY_PREFIX}host-blocked:${encodeURIComponent(shareToken)}`
}

export function gridSelectionStorageKeyHostPreview(shareToken: string) {
	return `${KEY_PREFIX}host-preview:${encodeURIComponent(shareToken)}`
}

export function readSlotIdsFromSessionStorage(
	key: string,
): Array<string> | null {
	const storage = safeSessionStorage()
	if (!storage) return null
	try {
		const raw = storage.getItem(key)
		if (raw === null) return null
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) return null
		const slots: Array<string> = []
		for (const entry of parsed) {
			if (typeof entry === 'string' && entry.length > 0) {
				slots.push(entry)
			}
		}
		return slots
	} catch {
		return null
	}
}

export function writeSlotIdsToSessionStorage(
	key: string,
	slots: ReadonlySet<string>,
) {
	const storage = safeSessionStorage()
	if (!storage) return
	try {
		const sorted = Array.from(slots).sort((left, right) =>
			left.localeCompare(right),
		)
		storage.setItem(key, JSON.stringify(sorted))
	} catch {
		// Quota or private mode — ignore.
	}
}

export function clearSlotIdsFromSessionStorage(key: string) {
	const storage = safeSessionStorage()
	if (!storage) return
	try {
		storage.removeItem(key)
	} catch {
		// ignore
	}
}

export function filterSlotsToValidSet(
	slots: ReadonlyArray<string>,
	valid: ReadonlySet<string>,
): Set<string> {
	const next = new Set<string>()
	for (const slot of slots) {
		if (valid.has(slot)) {
			next.add(slot)
		}
	}
	return next
}

export function areSlotIdSetsEqual(
	left: ReadonlySet<string>,
	right: ReadonlySet<string>,
): boolean {
	if (left.size !== right.size) return false
	for (const value of left) {
		if (!right.has(value)) return false
	}
	return true
}

const validHomeIntervalMinutes = new Set([15, 30, 60])

export function readHomeCreateFormFromSessionStorage(): HomeCreateFormSnapshot | null {
	const storage = safeSessionStorage()
	if (!storage) return null
	try {
		const raw = storage.getItem(HOME_CREATE_FORM_STORAGE_KEY)
		if (raw === null) return null
		const parsed = JSON.parse(raw) as unknown
		if (!parsed || typeof parsed !== 'object') return null
		const record = parsed as Record<string, unknown>
		const title = typeof record.title === 'string' ? record.title : ''
		const hostName = typeof record.hostName === 'string' ? record.hostName : ''
		const intervalRaw = record.intervalMinutes
		const intervalMinutes =
			typeof intervalRaw === 'number' &&
			validHomeIntervalMinutes.has(intervalRaw)
				? intervalRaw
				: 30
		const startDateInput =
			typeof record.startDateInput === 'string' ? record.startDateInput : ''
		const endDateInput =
			typeof record.endDateInput === 'string' ? record.endDateInput : ''
		const selectedRaw = record.selectedSlotIds
		const selectedSlotIds: Array<string> = []
		if (Array.isArray(selectedRaw)) {
			for (const entry of selectedRaw) {
				if (typeof entry === 'string' && entry.length > 0) {
					selectedSlotIds.push(entry)
				}
			}
		}
		return {
			title,
			hostName,
			intervalMinutes,
			startDateInput,
			endDateInput,
			selectedSlotIds,
		}
	} catch {
		return null
	}
}

export function writeHomeCreateFormToSessionStorage(
	snapshot: HomeCreateFormSnapshot,
) {
	const storage = safeSessionStorage()
	if (!storage) return
	try {
		const payload: HomeCreateFormSnapshot = {
			title: snapshot.title,
			hostName: snapshot.hostName,
			intervalMinutes: snapshot.intervalMinutes,
			startDateInput: snapshot.startDateInput,
			endDateInput: snapshot.endDateInput,
			selectedSlotIds: [...snapshot.selectedSlotIds].sort((left, right) =>
				left.localeCompare(right),
			),
		}
		storage.setItem(HOME_CREATE_FORM_STORAGE_KEY, JSON.stringify(payload))
	} catch {
		// Quota or private mode — ignore.
	}
}

export function clearHomeCreateFormFromSessionStorage() {
	const storage = safeSessionStorage()
	if (!storage) return
	try {
		storage.removeItem(HOME_CREATE_FORM_STORAGE_KEY)
	} catch {
		// ignore
	}
}
