import { type Handle } from 'remix/component'
import { setDocumentTitle, toAppTitle } from '#client/document-title.ts'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import { createPointerDragSelectionController } from '#client/pointer-drag-selection.ts'
import { getSelectionDiff } from '#client/schedule-selection-utils.ts'
import {
	createSlotAvailability,
	getMaxAvailabilityCount,
} from '#client/schedule-snapshot-utils.ts'
import {
	findSelectionForAttendee,
	formatSlotForAttendeeTimeZone,
	getRectangularSlotSelection,
} from '#client/schedule-utils.ts'
import {
	detectTapRangeMode,
	getTapRangeStartMessage,
	isTapRangeStartMessage,
	resolveTapRangeModeFromPointer,
} from '#client/tap-range-mode.ts'
import { type ScheduleSnapshot, normalizeName } from '#shared/schedule-store.ts'
import {
	colors,
	mq,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'

type ConnectionState = 'connecting' | 'live' | 'offline'

function parseShareToken(pathname: string) {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length < 2) return ''
	if (segments[0] !== 's') return ''
	return segments[1] ?? ''
}

function getBrowserTimeZone() {
	const value = Intl.DateTimeFormat().resolvedOptions().timeZone
	if (typeof value !== 'string') return 'UTC'
	const normalized = value.trim()
	return normalized || 'UTC'
}

function toWebSocketUrl(path: string) {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${path}`
}

export function ScheduleRoute(handle: Handle) {
	const browserTimeZone = getBrowserTimeZone()
	let shareToken = ''
	let attendeeName = ''
	let snapshot: ScheduleSnapshot | null = null
	let selectedSlots = new Set<string>()
	let persistedSelectedSlots = new Set<string>()
	let activeSlot: string | null = null
	let rangeAnchor: string | null = null
	let tapRangeAction: 'add' | 'remove' | null = null
	let mobileDayKey: string | null = null
	let useTapRangeMode = detectTapRangeMode()
	let statusMessage: string | null = null
	let statusError = false
	let isSaving = false
	let isDeletingSubmission = false
	let isRenamingSubmission = false
	let isLoading = true
	let socket: WebSocket | null = null
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null
	let offlinePollTimer: ReturnType<typeof setInterval> | null = null
	let offlinePollInFlight = false
	let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
	let hasDirtyChanges = false
	let changeVersion = 0
	let pendingSave = false
	let snapshotRequestId = 0
	let lastPathname = ''
	let initialNameLoaded = false
	let pendingRenameSourceName: string | null = null
	const autoSaveDelayMs = 650
	const reconnectDelayMs = 1200
	const offlinePollIntervalMs = 4000

	function setStatus(nextMessage: string | null, error = false) {
		statusMessage = nextMessage
		statusError = error
		handle.update()
	}

	function getPathname() {
		if (typeof window === 'undefined') return '/'
		return window.location.pathname
	}

	function getQueryName() {
		const params = new URLSearchParams(window.location.search)
		const value = params.get('name')
		return value ? normalizeName(value) : ''
	}

	function getBlockedSlots() {
		return new Set(snapshot?.blockedSlots ?? [])
	}

	function getPersistedSelectionForName(name: string) {
		if (!snapshot) return new Set<string>()
		const blockedSlots = getBlockedSlots()
		return new Set(
			findSelectionForAttendee({
				attendeeName: name,
				attendees: snapshot.attendees,
				availabilityByAttendee: snapshot.availabilityByAttendee,
			}).filter((slot) => !blockedSlots.has(slot)),
		)
	}

	function normalizeNameForLookup(name: string) {
		return normalizeName(name).toLowerCase()
	}

	function hasPersistedSubmissionForName(name: string) {
		if (!snapshot) return false
		const normalizedName = normalizeNameForLookup(name)
		if (!normalizedName) return false
		return snapshot.attendees.some(
			(attendee) => normalizeNameForLookup(attendee.name) === normalizedName,
		)
	}

	function getPersistedAttendeeName(name: string) {
		if (!snapshot) return null
		const normalizedName = normalizeNameForLookup(name)
		if (!normalizedName) return null
		return (
			snapshot.attendees.find(
				(attendee) => normalizeNameForLookup(attendee.name) === normalizedName,
			)?.name ?? null
		)
	}

	function normalizeLocalSelectionAgainstBlockedSlots() {
		const blockedSlots = getBlockedSlots()
		selectedSlots = new Set(
			Array.from(selectedSlots).filter((slot) => !blockedSlots.has(slot)),
		)
	}

	function clearSaveDebounceTimer() {
		if (!saveDebounceTimer) return
		clearTimeout(saveDebounceTimer)
		saveDebounceTimer = null
	}

	function clearSocketResources() {
		if (socket) {
			const currentSocket = socket
			socket = null
			currentSocket.onopen = null
			currentSocket.onmessage = null
			currentSocket.onerror = null
			currentSocket.onclose = null
			currentSocket.close()
		}
		if (reconnectTimer) {
			clearTimeout(reconnectTimer)
			reconnectTimer = null
		}
	}

	function clearOfflinePollTimer() {
		if (!offlinePollTimer) return
		clearInterval(offlinePollTimer)
		offlinePollTimer = null
		offlinePollInFlight = false
	}

	const pointerSelection = createPointerDragSelectionController({
		requestRender: () => {
			handle.update()
		},
		canUpdateSelection: () => !useTapRangeMode,
		getSelectionSlots: (startSlot, endSlot) => {
			if (!snapshot) return new Set<string>()
			const blockedSlots = getBlockedSlots()
			return new Set(
				getRectangularSlotSelection({
					slots: snapshot.slots,
					startSlot,
					endSlot,
				}).filter((slot) => !blockedSlots.has(slot)),
			)
		},
		applySelection: ({ mode, slots }) => {
			const shouldSelect = mode === 'add'
			let changed = false
			for (const slot of slots) {
				const wasSelected = selectedSlots.has(slot)
				if (wasSelected === shouldSelect) continue
				setSlotSelection(slot, shouldSelect)
				changed = true
			}
			return changed
		},
		onSelectionPreviewSlot: (slot) => {
			activeSlot = slot
		},
		onSelectionFinished: ({ changed }) => {
			if (!changed) return true
			markDirty()
			return false
		},
	})

	function cleanupResources() {
		clearSocketResources()
		clearOfflinePollTimer()
		clearSaveDebounceTimer()
		pointerSelection.cleanup()
		pendingSave = false
	}

	if (handle.signal.aborted) {
		cleanupResources()
	} else {
		handle.signal.addEventListener('abort', cleanupResources)
	}

	function setConnectionState(nextState: ConnectionState) {
		if (nextState === 'offline') {
			if (!offlinePollTimer) {
				offlinePollTimer = setInterval(() => {
					if (offlinePollInFlight) return
					offlinePollInFlight = true
					void loadSnapshot().finally(() => {
						offlinePollInFlight = false
					})
				}, offlinePollIntervalMs)
			}
		} else {
			clearOfflinePollTimer()
		}
		handle.update()
	}

	async function loadSnapshot() {
		const requestShareToken = shareToken
		if (!requestShareToken) return
		const requestId = ++snapshotRequestId
		try {
			const response = await fetch(`/api/schedules/${requestShareToken}`, {
				headers: { Accept: 'application/json' },
			})
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: ScheduleSnapshot
				error?: string
			} | null
			if (
				requestShareToken !== shareToken ||
				handle.signal.aborted ||
				requestId !== snapshotRequestId
			) {
				return
			}
			if (!response.ok || !payload?.ok || !payload.snapshot) {
				const errorText =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to load schedule.'
				setStatus(errorText, true)
				isLoading = false
				handle.update()
				return
			}

			snapshot = payload.snapshot
			isLoading = false

			if (!initialNameLoaded) {
				const initialName = getQueryName()
				if (initialName) attendeeName = initialName
				initialNameLoaded = true
			}

			persistedSelectedSlots = getPersistedSelectionForName(attendeeName)
			if (!hasDirtyChanges) {
				selectedSlots = new Set(persistedSelectedSlots)
			} else {
				normalizeLocalSelectionAgainstBlockedSlots()
			}

			handle.update()
		} catch {
			if (
				requestShareToken !== shareToken ||
				handle.signal.aborted ||
				requestId !== snapshotRequestId
			) {
				return
			}
			isLoading = false
			setStatus('Unable to load schedule.', true)
		}
	}

	async function saveAvailability() {
		const requestShareToken = shareToken
		if (!snapshot || !requestShareToken) return
		if (handle.signal.aborted) return
		if (isSaving) {
			pendingSave = true
			return
		}
		if (isDeletingSubmission || isRenamingSubmission) {
			pendingSave = true
			return
		}
		const normalizedName = normalizeName(attendeeName)
		if (!normalizedName) {
			setStatus('Enter your name before selecting availability.', true)
			return
		}

		const blockedSlots = getBlockedSlots()
		const sanitizedSelection = Array.from(selectedSlots)
			.filter((slot) => !blockedSlots.has(slot))
			.sort((left, right) => left.localeCompare(right))
		selectedSlots = new Set(sanitizedSelection)

		const saveVersion = changeVersion
		let shouldRetryAfterFailure = false
		isSaving = true
		handle.update()

		try {
			const response = await fetch(
				`/api/schedules/${requestShareToken}/availability`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: normalizedName,
						attendeeTimeZone: browserTimeZone,
						selectedSlots: sanitizedSelection,
					}),
				},
			)
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: ScheduleSnapshot
				error?: string
			} | null

			if (requestShareToken !== shareToken || handle.signal.aborted) return
			if (!response.ok || !payload?.ok || !payload?.snapshot) {
				shouldRetryAfterFailure = response.status >= 500
				const errorMessage =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to save availability.'
				setStatus(errorMessage, true)
				return
			}

			snapshot = payload.snapshot
			persistedSelectedSlots = getPersistedSelectionForName(attendeeName)
			if (saveVersion === changeVersion) {
				hasDirtyChanges = false
				setStatus(null, false)
			}
		} catch {
			if (requestShareToken !== shareToken || handle.signal.aborted) return
			shouldRetryAfterFailure = true
			setStatus('Network error while saving availability.', true)
		} finally {
			if (requestShareToken === shareToken && !handle.signal.aborted) {
				isSaving = false
				handle.update()
				const shouldReschedule =
					hasDirtyChanges && (pendingSave || shouldRetryAfterFailure)
				pendingSave = false
				if (shouldReschedule) {
					scheduleAutoSave()
				}
			} else {
				pendingSave = false
			}
		}
	}

	function scheduleAutoSave() {
		clearSaveDebounceTimer()
		if (handle.signal.aborted) return
		if (isDeletingSubmission || isRenamingSubmission) return
		const normalizedName = normalizeName(attendeeName)
		if (!normalizedName) return
		if (isSaving) {
			pendingSave = true
			return
		}
		saveDebounceTimer = setTimeout(() => {
			void saveAvailability()
		}, autoSaveDelayMs)
	}

	function markDirty() {
		hasDirtyChanges = true
		changeVersion += 1
		scheduleAutoSave()
		handle.update()
	}

	async function deleteSubmission() {
		const requestShareToken = shareToken
		if (!snapshot || !requestShareToken) return
		if (handle.signal.aborted || isDeletingSubmission || isRenamingSubmission) {
			return
		}
		const normalizedName = normalizeName(attendeeName)
		if (!normalizedName) {
			setStatus('Enter your name before deleting your submission.', true)
			return
		}

		clearSaveDebounceTimer()
		hasDirtyChanges = false
		pendingSave = false
		isDeletingSubmission = true
		handle.update()

		try {
			const response = await fetch(
				`/api/schedules/${requestShareToken}/submission-delete`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: normalizedName }),
				},
			)
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: ScheduleSnapshot
				deleted?: boolean
				error?: string
			} | null

			if (requestShareToken !== shareToken || handle.signal.aborted) return
			if (!response.ok || !payload?.ok || !payload.snapshot) {
				const errorMessage =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to delete submission.'
				setStatus(errorMessage, true)
				return
			}

			snapshot = payload.snapshot
			persistedSelectedSlots = getPersistedSelectionForName(attendeeName)
			selectedSlots = new Set(persistedSelectedSlots)
			rangeAnchor = null
			tapRangeAction = null
			pendingRenameSourceName = null
			hasDirtyChanges = false
			pendingSave = false
			setStatus(
				payload.deleted
					? 'Submission deleted.'
					: 'No saved submission to delete.',
			)
		} catch {
			if (requestShareToken !== shareToken || handle.signal.aborted) return
			setStatus('Network error while deleting submission.', true)
		} finally {
			if (requestShareToken === shareToken && !handle.signal.aborted) {
				isDeletingSubmission = false
				handle.update()
			}
		}
	}

	async function renameSubmission() {
		const requestShareToken = shareToken
		if (!snapshot || !requestShareToken) return
		if (handle.signal.aborted || isRenamingSubmission || isDeletingSubmission) {
			return
		}
		const renameSourceName = pendingRenameSourceName
		const currentName = normalizeName(renameSourceName ?? '')
		const nextName = normalizeName(attendeeName)
		if (!currentName) {
			setStatus('No saved submission to rename.', true)
			return
		}
		if (!nextName) {
			setStatus('Enter your updated name before renaming.', true)
			return
		}

		clearSaveDebounceTimer()
		hasDirtyChanges = false
		pendingSave = false
		isRenamingSubmission = true
		handle.update()

		try {
			const response = await fetch(
				`/api/schedules/${requestShareToken}/submission-rename`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						currentName,
						nextName,
					}),
				},
			)
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: ScheduleSnapshot
				renamed?: boolean
				error?: string
			} | null

			if (requestShareToken !== shareToken || handle.signal.aborted) return
			if (!response.ok || !payload?.ok || !payload.snapshot) {
				const errorMessage =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to update attendee name.'
				setStatus(errorMessage, true)
				return
			}

			snapshot = payload.snapshot
			persistedSelectedSlots = getPersistedSelectionForName(attendeeName)
			selectedSlots = new Set(persistedSelectedSlots)
			rangeAnchor = null
			tapRangeAction = null
			pendingRenameSourceName = null
			hasDirtyChanges = false
			pendingSave = false
			setStatus(payload.renamed ? 'Name updated.' : 'Name already up to date.')
		} catch {
			if (requestShareToken !== shareToken || handle.signal.aborted) return
			setStatus('Network error while updating attendee name.', true)
		} finally {
			if (requestShareToken === shareToken && !handle.signal.aborted) {
				isRenamingSubmission = false
				handle.update()
			}
		}
	}

	function setSlotSelection(slot: string, shouldSelect: boolean) {
		if (shouldSelect) {
			selectedSlots.add(slot)
			return
		}
		selectedSlots.delete(slot)
	}

	function applyRange(
		startSlot: string,
		endSlot: string,
		shouldSelect: boolean,
	) {
		if (!snapshot) return
		const startIndex = snapshot.slots.indexOf(startSlot)
		const endIndex = snapshot.slots.indexOf(endSlot)
		if (startIndex < 0 || endIndex < 0) return
		const min = Math.min(startIndex, endIndex)
		const max = Math.max(startIndex, endIndex)
		const blockedSlots = getBlockedSlots()
		for (let index = min; index <= max; index += 1) {
			const slot = snapshot.slots[index]
			if (!slot || blockedSlots.has(slot)) continue
			setSlotSelection(slot, shouldSelect)
		}
	}

	function ensureSlotIsEditable(slot: string) {
		activeSlot = slot
		const blockedSlots = getBlockedSlots()
		if (blockedSlots.has(slot)) {
			handle.update()
			return false
		}
		const normalizedName = normalizeName(attendeeName)
		if (!normalizedName) {
			setStatus('Enter your name before selecting availability.', true)
			return false
		}
		return true
	}

	function handleCellPointerDown(slot: string, event: PointerEvent) {
		const nextMode = resolveTapRangeModeFromPointer({
			currentMode: useTapRangeMode,
			pointerType: event.pointerType,
		})
		if (nextMode !== useTapRangeMode) {
			useTapRangeMode = nextMode
			rangeAnchor = null
			tapRangeAction = null
			if (isTapRangeStartMessage(statusMessage)) {
				setStatus(null, false)
			} else {
				handle.update()
			}
		}
		if (useTapRangeMode) return
		if (!ensureSlotIsEditable(slot)) return
		pointerSelection.startSelection({
			slot,
			event,
			mode: selectedSlots.has(slot) ? 'remove' : 'add',
		})
	}

	function handleCellPointerEnter(slot: string) {
		pointerSelection.updateSelectionToSlot(slot)
	}

	function handleCellPointerUp() {
		pointerSelection.finishSelection(false)
	}

	function handleCellClick(slot: string) {
		if (!useTapRangeMode) return
		if (!ensureSlotIsEditable(slot)) return
		if (!rangeAnchor) {
			rangeAnchor = slot
			tapRangeAction = selectedSlots.has(slot) ? 'remove' : 'add'
			activeSlot = slot
			setStatus(getTapRangeStartMessage(tapRangeAction))
			return
		}
		const shouldSelect = (tapRangeAction ?? 'add') === 'add'
		applyRange(rangeAnchor, slot, shouldSelect)
		rangeAnchor = null
		tapRangeAction = null
		activeSlot = slot
		setStatus(null, false)
		markDirty()
	}

	function connectSocket() {
		if (!shareToken || handle.signal.aborted) return
		clearSocketResources()
		setConnectionState('connecting')
		try {
			const ws = new WebSocket(toWebSocketUrl(`/ws/${shareToken}`))
			socket = ws
			ws.onopen = () => {
				if (socket !== ws || handle.signal.aborted) return
				setConnectionState('live')
			}
			ws.onmessage = (event) => {
				if (socket !== ws || handle.signal.aborted) return
				try {
					const payload = JSON.parse(String(event.data)) as {
						type?: string
					} | null
					if (payload?.type === 'schedule-updated') {
						void loadSnapshot()
					}
				} catch {
					return
				}
			}
			ws.onerror = () => {
				if (socket !== ws || handle.signal.aborted) return
				setConnectionState('offline')
			}
			ws.onclose = () => {
				if (socket !== ws || handle.signal.aborted) return
				setConnectionState('offline')
				reconnectTimer = setTimeout(() => {
					if (socket !== ws) return
					connectSocket()
				}, reconnectDelayMs)
			}
		} catch {
			setConnectionState('offline')
		}
	}

	handle.queueTask(async () => {
		const nextPathname = getPathname()
		if (nextPathname === lastPathname) return
		lastPathname = nextPathname
		clearSaveDebounceTimer()
		clearSocketResources()
		clearOfflinePollTimer()
		shareToken = parseShareToken(nextPathname)
		snapshot = null
		selectedSlots = new Set<string>()
		persistedSelectedSlots = new Set<string>()
		activeSlot = null
		rangeAnchor = null
		tapRangeAction = null
		mobileDayKey = null
		hasDirtyChanges = false
		changeVersion = 0
		pendingSave = false
		isSaving = false
		isDeletingSubmission = false
		isRenamingSubmission = false
		pendingRenameSourceName = null
		pointerSelection.cleanup()
		isLoading = true
		initialNameLoaded = false
		setStatus(null, false)
		await loadSnapshot()
		connectSocket()
	})

	return () => {
		const currentSnapshot = snapshot
		const blockedSlots = new Set(currentSnapshot?.blockedSlots ?? [])
		const slotAvailability = createSlotAvailability(currentSnapshot)
		const maxAvailabilityCount = getMaxAvailabilityCount(slotAvailability)
		const selectedCount = selectedSlots.size
		const pendingDiff = getSelectionDiff({
			currentSelection: selectedSlots,
			persistedSelection: persistedSelectedSlots,
		})
		const pendingChangeCount =
			pendingDiff.pendingAdded.size + pendingDiff.pendingRemoved.size
		const pendingSync =
			pendingChangeCount > 0 ||
			isSaving ||
			isDeletingSubmission ||
			isRenamingSubmission
		const normalizedAttendeeName = normalizeName(attendeeName)
		const hasPersistedSubmission = hasPersistedSubmissionForName(attendeeName)
		const canRenameSubmission =
			typeof pendingRenameSourceName === 'string' &&
			normalizedAttendeeName.length > 0 &&
			normalizeNameForLookup(pendingRenameSourceName) !==
				normalizeNameForLookup(attendeeName)
		const showRenameSubmissionButton =
			canRenameSubmission || isRenamingSubmission
		const showDeleteSubmissionButton =
			normalizedAttendeeName.length > 0 &&
			(hasPersistedSubmission || isDeletingSubmission) &&
			!showRenameSubmissionButton
		const attendeeEntries = currentSnapshot?.attendees ?? []
		const activeSlotAvailableNames = activeSlot
			? (currentSnapshot?.availableNamesBySlot[activeSlot] ?? [])
			: []
		const activeSlotAvailableNameSet = new Set(activeSlotAvailableNames)
		const activeSlotAvailableAttendees = attendeeEntries.filter((entry) =>
			activeSlotAvailableNameSet.has(entry.name),
		)
		const activeSlotUnavailableAttendees = attendeeEntries.filter(
			(entry) => !activeSlotAvailableNameSet.has(entry.name),
		)
		const activeSlotValue = activeSlot
		const activeSlotAvailableDetails =
			activeSlotValue === null
				? []
				: activeSlotAvailableAttendees.map((entry) => ({
						name: entry.name,
						...formatSlotForAttendeeTimeZone(activeSlotValue, entry.timeZone),
					}))
		const activeSlotUnavailableDetails =
			activeSlotValue === null
				? []
				: activeSlotUnavailableAttendees.map((entry) => ({
						name: entry.name,
						...formatSlotForAttendeeTimeZone(activeSlotValue, entry.timeZone),
					}))
		const activeSlotBlocked =
			activeSlotValue !== null && blockedSlots.has(activeSlotValue)
		const hostName =
			currentSnapshot?.attendees.find((entry) => entry.isHost)?.name ??
			'the organizer'

		if (!shareToken) {
			setDocumentTitle(toAppTitle('Schedule not found'))
			return (
				<section css={{ display: 'grid', gap: spacing.md }}>
					<h2 css={{ margin: 0, color: colors.text }}>Schedule not found</h2>
					<p css={{ margin: 0, color: colors.textMuted }}>
						This link is invalid.
					</p>
				</section>
			)
		}

		const scheduleTitle = currentSnapshot?.schedule.title.trim() ?? ''
		if (isLoading && !currentSnapshot) {
			setDocumentTitle(toAppTitle('Loading schedule'))
		} else if (currentSnapshot) {
			setDocumentTitle(
				toAppTitle(
					scheduleTitle
						? `${scheduleTitle} availability`
						: 'Schedule availability',
				),
			)
		} else {
			setDocumentTitle(toAppTitle('Schedule unavailable'))
		}

		return (
			<section css={{ display: 'grid', gap: spacing.lg }}>
				<header
					css={{
						display: 'grid',
						gap: spacing.sm,
						padding: spacing.lg,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						background:
							'linear-gradient(140deg, color-mix(in srgb, var(--color-primary) 22%, var(--color-surface)), color-mix(in srgb, var(--color-primary) 8%, var(--color-background)))',
						boxShadow: shadows.sm,
					}}
				>
					<h1
						css={{
							margin: 0,
							fontSize: typography.fontSize.xl,
							fontWeight: typography.fontWeight.semibold,
							color: colors.text,
						}}
					>
						{currentSnapshot?.schedule.title ?? 'Schedule'}
					</h1>
					<p css={{ margin: 0, color: colors.textMuted }}>
						Hosted by {hostName}
					</p>
					<p css={{ margin: 0, color: colors.textMuted }}>
						Enter your name, then mark every time that works for you.
					</p>
					<p
						css={{
							margin: 0,
							color: colors.textMuted,
							[mq.mobile]: {
								display: 'none',
							},
						}}
					>
						Desktop: click and drag across slots to add or remove availability.
					</p>
					<p
						css={{
							margin: 0,
							color: colors.textMuted,
							display: 'none',
							[mq.mobile]: {
								display: 'block',
							},
						}}
					>
						Mobile: tap one slot to start a range, then tap another to apply it.
					</p>
				</header>

				<section
					css={{
						display: 'grid',
						gap: spacing.md,
						padding: spacing.lg,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						backgroundColor: colors.surface,
						boxShadow: shadows.sm,
					}}
				>
					<div
						css={{
							display: 'grid',
							gap: spacing.md,
							gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
							[mq.mobile]: {
								gridTemplateColumns: '1fr',
							},
						}}
					>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span
								css={{ color: colors.text, fontSize: typography.fontSize.sm }}
							>
								Your name
							</span>
							<input
								type="text"
								value={attendeeName}
								placeholder="Add your name"
								on={{
									input: (event) => {
										const nextName = event.currentTarget.value
										const previousPersistedName =
											getPersistedAttendeeName(attendeeName)
										attendeeName = nextName
										const nextPersistedName =
											getPersistedAttendeeName(attendeeName)
										if (nextPersistedName) {
											pendingRenameSourceName = null
										} else if (
											previousPersistedName &&
											normalizeNameForLookup(previousPersistedName) !==
												normalizeNameForLookup(attendeeName)
										) {
											pendingRenameSourceName = previousPersistedName
										}
										persistedSelectedSlots =
											getPersistedSelectionForName(attendeeName)
										if (!hasDirtyChanges) {
											selectedSlots = new Set(persistedSelectedSlots)
										}
										if (!normalizeName(attendeeName)) {
											clearSaveDebounceTimer()
										} else if (hasDirtyChanges) {
											scheduleAutoSave()
										}
										handle.update()
									},
								}}
								css={{
									padding: `${spacing.sm} ${spacing.md}`,
									borderRadius: radius.md,
									border: `1px solid ${colors.border}`,
									backgroundColor: colors.background,
									color: colors.text,
								}}
							/>
						</label>
						<div
							css={{
								display: 'grid',
								alignContent: 'end',
								gap: spacing.xs,
							}}
						>
							<p css={{ margin: 0, color: colors.textMuted }}>
								{selectedCount} selected slot{selectedCount === 1 ? '' : 's'}
							</p>
							<p css={{ margin: 0, color: colors.textMuted }}>
								Times are shown in your browser timezone: {browserTimeZone}
							</p>
						</div>
					</div>

					{isLoading ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Loading schedule…
						</p>
					) : currentSnapshot ? (
						renderScheduleGrid({
							slots: currentSnapshot.slots,
							selectedSlots,
							disabledSlots: blockedSlots,
							hideDisabledOnlyRowsAndColumns: true,
							selectionSlots: pointerSelection.state.slots,
							selectionSlotLabel: 'included in pending drag selection',
							mobileDayKey,
							slotAvailability,
							maxAvailabilityCount,
							activeSlot,
							rangeAnchor,
							pending: pendingSync,
							onMobileDayChange: (dayKey) => {
								mobileDayKey = dayKey
								handle.update()
							},
							onCellPointerDown: handleCellPointerDown,
							onCellPointerEnter: (slot, _event) => {
								handleCellPointerEnter(slot)
							},
							onCellPointerUp: (_slot, _event) => {
								handleCellPointerUp()
							},
							onCellClick: (slot, _event) => {
								if (!useTapRangeMode) return
								handleCellClick(slot)
							},
							onCellFocus: (slot) => {
								activeSlot = slot
								handle.update()
							},
						})
					) : (
						<p css={{ margin: 0, color: colors.error }}>
							Schedule not found or unavailable.
						</p>
					)}

					{activeSlot && currentSnapshot ? (
						<section
							aria-live="polite"
							css={{
								display: 'grid',
								gap: spacing.sm,
								padding: spacing.md,
								borderRadius: radius.md,
								border: `1px solid ${colors.border}`,
								backgroundColor: colors.background,
							}}
						>
							<h2
								css={{
									margin: 0,
									fontSize: typography.fontSize.base,
									color: colors.text,
								}}
							>
								Slot details
							</h2>
							<p css={{ margin: 0, color: colors.textMuted }}>
								{new Intl.DateTimeFormat(undefined, {
									weekday: 'long',
									month: 'long',
									day: 'numeric',
									hour: 'numeric',
									minute: '2-digit',
								}).format(new Date(activeSlot))}
							</p>
							{activeSlotBlocked ? (
								<p css={{ margin: 0, color: colors.error, fontWeight: 600 }}>
									This slot is unavailable because the host blocked it.
								</p>
							) : null}
							<div css={{ display: 'grid', gap: spacing.xs }}>
								<p css={{ margin: 0, color: colors.text, fontWeight: 600 }}>
									Available ({activeSlotAvailableDetails.length})
								</p>
								{activeSlotAvailableDetails.length > 0 ? (
									<ul
										css={{
											margin: 0,
											paddingLeft: '1rem',
											display: 'grid',
											gap: spacing.xs,
										}}
									>
										{activeSlotAvailableDetails.map((entry) => (
											<li key={`available-${entry.name}`}>
												<strong>{entry.name}</strong> — {entry.localTime} (
												{entry.timeZoneLabel})
											</li>
										))}
									</ul>
								) : (
									<p css={{ margin: 0, color: colors.textMuted }}>None</p>
								)}
							</div>
							<div css={{ display: 'grid', gap: spacing.xs }}>
								<p
									css={{ margin: 0, color: colors.textMuted, fontWeight: 600 }}
								>
									Unavailable ({activeSlotUnavailableDetails.length})
								</p>
								{activeSlotUnavailableDetails.length > 0 ? (
									<ul
										css={{
											margin: 0,
											paddingLeft: '1rem',
											display: 'grid',
											gap: spacing.xs,
										}}
									>
										{activeSlotUnavailableDetails.map((entry) => (
											<li key={`unavailable-${entry.name}`}>
												<strong>{entry.name}</strong> — {entry.localTime} (
												{entry.timeZoneLabel})
											</li>
										))}
									</ul>
								) : (
									<p css={{ margin: 0, color: colors.textMuted }}>None</p>
								)}
							</div>
						</section>
					) : null}

					{!normalizedAttendeeName ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Add your name before selecting availability.
						</p>
					) : null}
					{showRenameSubmissionButton ? (
						<button
							type="button"
							on={{ click: () => void renameSubmission() }}
							disabled={
								isSaving || isDeletingSubmission || isRenamingSubmission
							}
							css={{
								justifySelf: 'start',
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radius.full,
								border: `1px solid ${colors.primary}`,
								backgroundColor: 'transparent',
								color: colors.primary,
								fontWeight: typography.fontWeight.medium,
								cursor:
									isSaving || isDeletingSubmission || isRenamingSubmission
										? 'not-allowed'
										: 'pointer',
								opacity:
									isSaving || isDeletingSubmission || isRenamingSubmission
										? 0.72
										: 1,
							}}
						>
							{isRenamingSubmission ? 'Updating name…' : 'Change my name'}
						</button>
					) : null}
					{showDeleteSubmissionButton ? (
						<button
							type="button"
							on={{ click: () => void deleteSubmission() }}
							disabled={
								isSaving || isDeletingSubmission || isRenamingSubmission
							}
							css={{
								justifySelf: 'start',
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radius.full,
								border: `1px solid ${colors.error}`,
								backgroundColor: 'transparent',
								color: colors.error,
								fontWeight: typography.fontWeight.medium,
								cursor:
									isSaving || isDeletingSubmission ? 'not-allowed' : 'pointer',
								opacity: isSaving || isDeletingSubmission ? 0.72 : 1,
							}}
						>
							{isDeletingSubmission
								? 'Deleting submission…'
								: 'Delete my submission'}
						</button>
					) : null}
					{pointerSelection.state.mode ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Selecting {pointerSelection.state.slots.size} slot
							{pointerSelection.state.slots.size === 1 ? '' : 's'} — release to
							apply or press Escape to cancel.
						</p>
					) : null}
					{statusMessage ? (
						<p
							role={statusError ? 'alert' : undefined}
							aria-live="polite"
							css={{
								margin: 0,
								color: statusError ? colors.error : colors.textMuted,
								fontSize: typography.fontSize.sm,
							}}
						>
							{statusMessage}
						</p>
					) : null}
				</section>
			</section>
		)
	}
}
