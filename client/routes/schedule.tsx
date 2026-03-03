import { type Handle } from 'remix/component'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import {
	computeAutoScrollStep,
	findSlotAtPoint,
	getGridScrollerFromPointerEvent,
	setPointerCaptureIfAvailable,
} from '#client/grid-drag-autoscroll.ts'
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
	let isLoading = true
	let connectionState: ConnectionState = 'connecting'
	let socket: WebSocket | null = null
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null
	let offlinePollTimer: ReturnType<typeof setInterval> | null = null
	let offlinePollInFlight = false
	let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
	let hasDirtyChanges = false
	let changeVersion = 0
	let pendingSave = false
	let snapshotRequestId = 0
	let pointerSelectionMode: 'add' | 'remove' | null = null
	let pointerSelectionStartSlot: string | null = null
	let pointerSelectionEndSlot: string | null = null
	let pointerSelectionSlots = new Set<string>()
	let pointerSelectionScroller: HTMLElement | null = null
	let pointerPointerX = 0
	let pointerPointerY = 0
	let pointerAutoScrollRaf: number | null = null
	let lastPathname = ''
	let initialNameLoaded = false
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

	function clearPointerAutoScrollRaf() {
		if (pointerAutoScrollRaf === null) return
		cancelAnimationFrame(pointerAutoScrollRaf)
		pointerAutoScrollRaf = null
	}

	function clearPointerSelection() {
		clearPointerAutoScrollRaf()
		pointerSelectionMode = null
		pointerSelectionStartSlot = null
		pointerSelectionEndSlot = null
		pointerSelectionSlots = new Set<string>()
		pointerSelectionScroller = null
	}

	function detachPointerSelectionListeners() {
		if (typeof window === 'undefined') return
		window.removeEventListener('pointerup', handleGlobalPointerUp)
		window.removeEventListener('pointermove', handleGlobalPointerMove)
		window.removeEventListener('keydown', handleGlobalKeyDown)
	}

	function attachPointerSelectionListeners() {
		if (typeof window === 'undefined') return
		detachPointerSelectionListeners()
		window.addEventListener('pointerup', handleGlobalPointerUp)
		window.addEventListener('pointermove', handleGlobalPointerMove)
		window.addEventListener('keydown', handleGlobalKeyDown)
	}

	function getPointerSelectionSlots(startSlot: string, endSlot: string) {
		if (!snapshot) return new Set<string>()
		const blockedSlots = getBlockedSlots()
		return new Set(
			getRectangularSlotSelection({
				slots: snapshot.slots,
				startSlot,
				endSlot,
			}).filter((slot) => !blockedSlots.has(slot)),
		)
	}

	function applyPendingPointerSelection() {
		if (!pointerSelectionMode || pointerSelectionSlots.size === 0) return false
		const shouldSelect = pointerSelectionMode === 'add'
		let changed = false
		for (const slot of pointerSelectionSlots) {
			const wasSelected = selectedSlots.has(slot)
			if (wasSelected === shouldSelect) continue
			setSlotSelection(slot, shouldSelect)
			changed = true
		}
		return changed
	}

	function updatePointerSelectionToSlot(slot: string) {
		if (
			useTapRangeMode ||
			!pointerSelectionMode ||
			!pointerSelectionStartSlot ||
			pointerSelectionEndSlot === slot
		) {
			return
		}
		pointerSelectionEndSlot = slot
		pointerSelectionSlots = getPointerSelectionSlots(
			pointerSelectionStartSlot,
			slot,
		)
		activeSlot = slot
		handle.update()
	}

	function refreshPointerSelectionAtPosition() {
		const slot = findSlotAtPoint(pointerPointerX, pointerPointerY, {
			withinElement: pointerSelectionScroller,
		})
		if (!slot) return
		updatePointerSelectionToSlot(slot)
	}

	function runPointerAutoScrollStep() {
		pointerAutoScrollRaf = null
		if (!pointerSelectionMode || !pointerSelectionScroller) return
		const delta = computeAutoScrollStep({
			clientX: pointerPointerX,
			clientY: pointerPointerY,
			rect: pointerSelectionScroller.getBoundingClientRect(),
		})
		if (delta.left === 0 && delta.top === 0) return
		pointerSelectionScroller.scrollBy({
			left: delta.left,
			top: delta.top,
		})
		refreshPointerSelectionAtPosition()
		pointerAutoScrollRaf = requestAnimationFrame(runPointerAutoScrollStep)
	}

	function maybeStartPointerAutoScroll() {
		if (!pointerSelectionMode || !pointerSelectionScroller) return
		if (pointerAutoScrollRaf !== null) return
		const delta = computeAutoScrollStep({
			clientX: pointerPointerX,
			clientY: pointerPointerY,
			rect: pointerSelectionScroller.getBoundingClientRect(),
		})
		if (delta.left === 0 && delta.top === 0) return
		pointerAutoScrollRaf = requestAnimationFrame(runPointerAutoScrollStep)
	}

	function finishPointerSelection(cancelled = false) {
		if (!pointerSelectionMode) return
		detachPointerSelectionListeners()
		const changed = cancelled ? false : applyPendingPointerSelection()
		clearPointerSelection()
		if (changed) {
			markDirty()
			return
		}
		handle.update()
	}

	function handleGlobalPointerUp() {
		finishPointerSelection(false)
	}

	function handleGlobalPointerMove(event: PointerEvent) {
		if (!pointerSelectionMode) return
		pointerPointerX = event.clientX
		pointerPointerY = event.clientY
		refreshPointerSelectionAtPosition()
		maybeStartPointerAutoScroll()
	}

	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !pointerSelectionMode) return
		event.preventDefault()
		finishPointerSelection(true)
	}

	function cleanupResources() {
		clearSocketResources()
		clearOfflinePollTimer()
		clearSaveDebounceTimer()
		detachPointerSelectionListeners()
		clearPointerSelection()
		pendingSave = false
	}

	if (handle.signal.aborted) {
		cleanupResources()
	} else {
		handle.signal.addEventListener('abort', cleanupResources)
	}

	function setConnectionState(nextState: ConnectionState) {
		connectionState = nextState
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
		setPointerCaptureIfAvailable(event)
		pointerSelectionMode = selectedSlots.has(slot) ? 'remove' : 'add'
		pointerSelectionStartSlot = slot
		pointerSelectionEndSlot = slot
		pointerSelectionSlots = getPointerSelectionSlots(slot, slot)
		pointerSelectionScroller = getGridScrollerFromPointerEvent(event)
		pointerPointerX = event.clientX
		pointerPointerY = event.clientY
		activeSlot = slot
		attachPointerSelectionListeners()
		maybeStartPointerAutoScroll()
		handle.update()
	}

	function handleCellPointerEnter(slot: string) {
		updatePointerSelectionToSlot(slot)
	}

	function handleCellPointerMove(event: PointerEvent) {
		if (!pointerSelectionMode) return
		pointerPointerX = event.clientX
		pointerPointerY = event.clientY
		refreshPointerSelectionAtPosition()
		maybeStartPointerAutoScroll()
	}

	function handleCellPointerUp() {
		finishPointerSelection(false)
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
		clearPointerSelection()
		detachPointerSelectionListeners()
		connectionState = 'offline'
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
		const pendingSync = pendingChangeCount > 0 || isSaving
		const normalizedAttendeeName = normalizeName(attendeeName)
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
		const connectionLabel =
			connectionState === 'live'
				? 'Realtime connected'
				: connectionState === 'connecting'
					? 'Connecting realtime…'
					: `Realtime unavailable; polling every ${Math.floor(offlinePollIntervalMs / 1000)}s`

		if (!shareToken) {
			return (
				<section css={{ display: 'grid', gap: spacing.md }}>
					<h2 css={{ margin: 0, color: colors.text }}>Schedule not found</h2>
					<p css={{ margin: 0, color: colors.textMuted }}>
						This link is invalid.
					</p>
				</section>
			)
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
						Share token: <code>{shareToken}</code>
					</p>
					<p css={{ margin: 0, color: colors.textMuted }}>{connectionLabel}</p>
					<p css={{ margin: 0, color: colors.textMuted }}>
						Need host controls? Ask the organizer for their host dashboard link.
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
										attendeeName = event.currentTarget.value
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
							selectionSlots: pointerSelectionSlots,
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
							onCellPointerMove: (_slot, event) => {
								handleCellPointerMove(event)
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
					{pointerSelectionMode ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Selecting {pointerSelectionSlots.size} slot
							{pointerSelectionSlots.size === 1 ? '' : 's'} — release to apply
							or press Escape to cancel.
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
