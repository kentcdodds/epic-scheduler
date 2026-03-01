import { type Handle } from 'remix/component'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import { findSelectionForAttendee } from '#client/schedule-utils.ts'
import { normalizeName } from '#shared/schedule-store.ts'
import {
	colors,
	mq,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'

type Snapshot = {
	schedule: {
		shareToken: string
		title: string
		intervalMinutes: 15 | 30 | 60
		rangeStartUtc: string
		rangeEndUtc: string
		createdAt: string
	}
	slots: Array<string>
	attendees: Array<{
		id: string
		name: string
		isHost: boolean
		timeZone: string | null
	}>
	availabilityByAttendee: Record<string, Array<string>>
	countsBySlot: Record<string, number>
	availableNamesBySlot: Record<string, Array<string>>
}

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

const attendeeLocalTimeFormatters = new Map<string, Intl.DateTimeFormat>()

function formatSlotForAttendeeTimeZone(slot: string, timeZone: string | null) {
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

function createSlotAvailability(snapshot: Snapshot | null) {
	if (!snapshot) {
		return {} as Record<
			string,
			{ count: number; availableNames: Array<string> }
		>
	}
	return Object.fromEntries(
		snapshot.slots.map((slot) => [
			slot,
			{
				count: snapshot.countsBySlot[slot] ?? 0,
				availableNames: snapshot.availableNamesBySlot[slot] ?? [],
			},
		]),
	)
}

function toWebSocketUrl(path: string) {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${path}`
}

function getSelectionDiff(params: {
	currentSelection: ReadonlySet<string>
	persistedSelection: ReadonlySet<string>
}) {
	const pendingAdded = new Set<string>()
	const pendingRemoved = new Set<string>()

	for (const slot of params.currentSelection) {
		if (!params.persistedSelection.has(slot)) {
			pendingAdded.add(slot)
		}
	}
	for (const slot of params.persistedSelection) {
		if (!params.currentSelection.has(slot)) {
			pendingRemoved.add(slot)
		}
	}

	return {
		pendingAdded,
		pendingRemoved,
	}
}

export function ScheduleRoute(handle: Handle) {
	const browserTimeZone = getBrowserTimeZone()
	let shareToken = ''
	let attendeeName = ''
	let snapshot: Snapshot | null = null
	let selectedSlots = new Set<string>()
	let persistedSelectedSlots = new Set<string>()
	let activeSlot: string | null = null
	let rangeAnchor: string | null = null
	let tapRangeAction: 'add' | 'remove' | null = null
	let mobileDayKey: string | null = null
	let useTapRangeMode = false
	let saveMessage: string | null = null
	let saveError = false
	let isSaving = false
	let isLoading = true
	let connectionState: ConnectionState = 'connecting'
	let socket: WebSocket | null = null
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null
	let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
	let hasDirtyChanges = false
	let changeVersion = 0
	let pendingSave = false
	let paintMode: 'add' | 'remove' | null = null
	let dragging = false
	let lastPointerSlot: string | null = null
	let lastPathname = ''
	let initialNameLoaded = false
	const autoSaveDelayMs = 650

	function setStatusMessage(message: string | null, error = false) {
		saveMessage = message
		saveError = error
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

	function getPersistedSelectionForName(name: string) {
		if (!snapshot) return new Set<string>()
		return new Set(
			findSelectionForAttendee({
				attendeeName: name,
				attendees: snapshot.attendees,
				availabilityByAttendee: snapshot.availabilityByAttendee,
			}),
		)
	}

	function clearSaveDebounceTimer() {
		if (saveDebounceTimer) {
			clearTimeout(saveDebounceTimer)
			saveDebounceTimer = null
		}
	}

	function clearSocketResources() {
		if (socket) {
			const current = socket
			socket = null
			current.onopen = null
			current.onmessage = null
			current.onerror = null
			current.onclose = null
			current.close()
		}
		if (reconnectTimer) {
			clearTimeout(reconnectTimer)
			reconnectTimer = null
		}
	}

	function cleanupResources() {
		clearSocketResources()
		if (saveDebounceTimer) {
			clearTimeout(saveDebounceTimer)
			saveDebounceTimer = null
		}
		pendingSave = false
	}

	if (handle.signal.aborted) {
		cleanupResources()
	} else {
		handle.signal.addEventListener('abort', cleanupResources)
	}

	async function loadSnapshot() {
		const requestShareToken = shareToken
		if (!requestShareToken) return
		try {
			const response = await fetch(`/api/schedules/${requestShareToken}`, {
				headers: { Accept: 'application/json' },
			})
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: Snapshot
				error?: string
			} | null
			if (requestShareToken !== shareToken) return
			if (!response.ok || !payload?.ok || !payload.snapshot) {
				const errorText =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to load schedule.'
				setStatusMessage(errorText, true)
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
			}

			handle.update()
		} catch {
			if (requestShareToken !== shareToken) return
			isLoading = false
			setStatusMessage('Unable to load schedule.', true)
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
			setStatusMessage('Enter your name before saving availability.', true)
			return
		}

		const saveVersion = changeVersion
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
						selectedSlots: Array.from(selectedSlots).sort((left, right) =>
							left.localeCompare(right),
						),
					}),
				},
			)
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: Snapshot
				error?: string
			} | null

			if (requestShareToken !== shareToken || handle.signal.aborted) return
			if (!response.ok || !payload?.ok || !payload?.snapshot) {
				const errorMessage =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to save availability.'
				setStatusMessage(errorMessage, true)
				return
			}

			snapshot = payload.snapshot
			persistedSelectedSlots = getPersistedSelectionForName(attendeeName)
			if (saveVersion === changeVersion) {
				hasDirtyChanges = false
				if (saveError || saveMessage) {
					setStatusMessage(null, false)
				}
			}
		} catch {
			if (requestShareToken !== shareToken || handle.signal.aborted) return
			setStatusMessage('Network error while saving availability.', true)
		} finally {
			if (requestShareToken === shareToken && !handle.signal.aborted) {
				isSaving = false
				handle.update()
				const shouldReschedule = pendingSave && hasDirtyChanges
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
		for (let index = min; index <= max; index += 1) {
			const slot = snapshot.slots[index]
			if (!slot) continue
			setSlotSelection(slot, shouldSelect)
		}
	}

	function handleCellPointerDown(slot: string, event: PointerEvent) {
		if (useTapRangeMode) return
		if (event.pointerType === 'touch') return
		paintMode = selectedSlots.has(slot) ? 'remove' : 'add'
		dragging = true
		lastPointerSlot = slot
		setSlotSelection(slot, paintMode === 'add')
		markDirty()
	}

	function handleCellPointerEnter(slot: string) {
		if (!dragging || !paintMode || useTapRangeMode) return
		if (lastPointerSlot === slot) return
		lastPointerSlot = slot
		setSlotSelection(slot, paintMode === 'add')
		markDirty()
	}

	function handleCellPointerUp() {
		dragging = false
		paintMode = null
		lastPointerSlot = null
	}

	function handleCellClick(slot: string) {
		if (!useTapRangeMode) return
		if (!rangeAnchor) {
			rangeAnchor = slot
			tapRangeAction = selectedSlots.has(slot) ? 'remove' : 'add'
			activeSlot = slot
			setStatusMessage(
				tapRangeAction === 'remove'
					? 'Range start selected. Tap another slot to remove range.'
					: 'Range start selected. Tap another slot to add range.',
			)
			return
		}
		const shouldSelect = (tapRangeAction ?? 'add') === 'add'
		applyRange(rangeAnchor, slot, shouldSelect)
		rangeAnchor = null
		tapRangeAction = null
		activeSlot = slot
		setStatusMessage(null, false)
		markDirty()
	}

	function connectSocket() {
		if (!shareToken || handle.signal.aborted) return
		clearSocketResources()
		connectionState = 'connecting'
		const ws = new WebSocket(toWebSocketUrl(`/ws/${shareToken}`))
		socket = ws
		ws.onopen = () => {
			if (socket !== ws || handle.signal.aborted) return
			connectionState = 'live'
			handle.update()
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
			connectionState = 'offline'
			handle.update()
		}
		ws.onclose = () => {
			if (socket !== ws || handle.signal.aborted) return
			connectionState = 'offline'
			handle.update()
			reconnectTimer = setTimeout(() => {
				if (socket !== ws) return
				connectSocket()
			}, 1200)
		}
	}

	handle.queueTask(async () => {
		const nextPathname = getPathname()
		if (nextPathname === lastPathname) return
		lastPathname = nextPathname
		clearSaveDebounceTimer()
		clearSocketResources()
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
		paintMode = null
		dragging = false
		lastPointerSlot = null
		connectionState = 'offline'
		isLoading = true
		initialNameLoaded = false
		setStatusMessage(null, false)
		await loadSnapshot()
		connectSocket()
	})

	return () => {
		const currentSnapshot = snapshot
		const slotAvailability = createSlotAvailability(currentSnapshot)
		const maxAvailabilityCount = Math.max(
			1,
			...Object.values(slotAvailability).map((value) => value.count),
		)
		const selectedCount = selectedSlots.size
		const pendingDiff = getSelectionDiff({
			currentSelection: selectedSlots,
			persistedSelection: persistedSelectedSlots,
		})
		const pendingAddCount = pendingDiff.pendingAdded.size
		const pendingRemoveCount = pendingDiff.pendingRemoved.size
		const pendingChangeCount = pendingAddCount + pendingRemoveCount
		const isDebouncingSave =
			saveDebounceTimer !== null && !isSaving && pendingChangeCount > 0
		const normalizedAttendeeName = normalizeName(attendeeName)
		const isSyncBlocked = !normalizedAttendeeName && pendingChangeCount > 0
		const hasStableSyncError =
			saveError && pendingChangeCount === 0 && !isSaving && !isSyncBlocked
		const syncSummary = isSyncBlocked
			? 'Sync blocked: name required'
			: isSaving && pendingSave
				? 'Saving changes (more queued)...'
				: isSaving
					? 'Saving changes...'
					: pendingChangeCount > 0 && isDebouncingSave
						? 'Changes queued for autosave'
						: pendingChangeCount > 0
							? 'Unsynced local changes'
							: saveError
								? 'Last sync failed'
								: 'All changes saved'
		const syncDetails =
			pendingChangeCount > 0
				? `${pendingAddCount} add · ${pendingRemoveCount} remove`
				: 'Server and local selections match.'
		const syncSurfaceColor = hasStableSyncError
			? 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))'
			: isSyncBlocked
				? 'color-mix(in srgb, var(--color-error) 8%, var(--color-surface))'
				: pendingChangeCount > 0
					? 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))'
					: 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))'
		const syncBorderColor =
			hasStableSyncError || isSyncBlocked
				? 'color-mix(in srgb, var(--color-error) 48%, var(--color-border))'
				: pendingChangeCount > 0
					? 'color-mix(in srgb, var(--color-primary) 42%, var(--color-border))'
					: colors.border
		const syncDotColor =
			hasStableSyncError || isSyncBlocked
				? colors.error
				: pendingChangeCount > 0 || isSaving
					? colors.primary
					: 'color-mix(in srgb, var(--color-primary) 40%, var(--color-text-muted))'
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
		const activeSlotPendingStatus =
			activeSlot && pendingDiff.pendingAdded.has(activeSlot)
				? 'Pending add to your availability.'
				: activeSlot && pendingDiff.pendingRemoved.has(activeSlot)
					? 'Pending removal from your availability.'
					: null
		const inlineStatusText = saveMessage ?? '\u00a0'
		const showInlineStatus = Boolean(saveMessage)
		const connectionLabel =
			connectionState === 'live'
				? 'Realtime connected'
				: connectionState === 'connecting'
					? 'Connecting realtime…'
					: 'Realtime offline (retrying)'

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
							<button
								type="button"
								on={{ click: () => void saveAvailability() }}
								disabled={isSaving || !snapshot}
								css={{
									padding: `${spacing.sm} ${spacing.lg}`,
									borderRadius: radius.full,
									border: 'none',
									backgroundColor: colors.primary,
									color: colors.onPrimary,
									fontWeight: typography.fontWeight.semibold,
									cursor: isSaving ? 'not-allowed' : 'pointer',
									opacity: isSaving ? 0.8 : 1,
									boxShadow:
										pendingChangeCount > 0 && !isSaving
											? `0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent)`
											: 'none',
								}}
							>
								{isSaving ? 'Saving…' : 'Save availability'}
							</button>
							<p
								css={{
									margin: 0,
									color: colors.textMuted,
									whiteSpace: 'nowrap',
									fontVariantNumeric: 'tabular-nums',
								}}
							>
								{selectedCount} selected slot{selectedCount === 1 ? '' : 's'} ·{' '}
								{pendingChangeCount} pending
							</p>
						</div>
					</div>

					<section
						role="status"
						aria-live="polite"
						css={{
							display: 'grid',
							gap: spacing.xs,
							padding: spacing.md,
							borderRadius: radius.md,
							border: `1px solid ${syncBorderColor}`,
							backgroundColor: syncSurfaceColor,
						}}
					>
						<div
							css={{
								display: 'grid',
								gridTemplateColumns: 'auto minmax(0, 1fr)',
								gap: spacing.sm,
								alignItems: 'center',
							}}
						>
							<span
								aria-hidden
								css={{
									display: 'inline-block',
									width: '0.65rem',
									height: '0.65rem',
									borderRadius: radius.full,
									backgroundColor: syncDotColor,
								}}
							/>
							<div css={{ display: 'grid', gap: spacing.xs, minWidth: 0 }}>
								<strong
									css={{
										color: colors.text,
										fontSize: typography.fontSize.sm,
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										minHeight: '1.3rem',
									}}
								>
									{syncSummary}
								</strong>
								<span
									css={{
										color: colors.textMuted,
										fontSize: typography.fontSize.sm,
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										minHeight: '1.25rem',
									}}
								>
									{syncDetails}
								</span>
							</div>
						</div>
						<div
							css={{
								display: 'flex',
								flexWrap: 'nowrap',
								gap: spacing.xs,
								overflowX: 'auto',
								minHeight: '1.65rem',
								alignItems: 'center',
							}}
						>
							{pendingChangeCount > 0 ? (
								<>
									{pendingAddCount > 0 ? (
										<span
											css={{
												padding: `${spacing.xs} ${spacing.sm}`,
												borderRadius: radius.full,
												backgroundColor:
													'color-mix(in srgb, var(--color-primary) 18%, var(--color-surface))',
												color: colors.text,
												fontSize: typography.fontSize.xs,
												fontWeight: typography.fontWeight.medium,
												whiteSpace: 'nowrap',
											}}
										>
											Pending add: {pendingAddCount}
										</span>
									) : null}
									{pendingRemoveCount > 0 ? (
										<span
											css={{
												padding: `${spacing.xs} ${spacing.sm}`,
												borderRadius: radius.full,
												backgroundColor:
													'color-mix(in srgb, var(--color-error) 16%, var(--color-surface))',
												color: colors.text,
												fontSize: typography.fontSize.xs,
												fontWeight: typography.fontWeight.medium,
												whiteSpace: 'nowrap',
											}}
										>
											Pending remove: {pendingRemoveCount}
										</span>
									) : null}
								</>
							) : (
								<span
									aria-hidden
									css={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radius.full,
										border: `1px solid ${colors.border}`,
										color: 'transparent',
										fontSize: typography.fontSize.xs,
										whiteSpace: 'nowrap',
										pointerEvents: 'none',
									}}
								>
									Pending add: 0
								</span>
							)}
						</div>
					</section>

					<div
						css={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: spacing.sm,
							alignItems: 'center',
						}}
					>
						<button
							type="button"
							on={{
								click: () => {
									useTapRangeMode = !useTapRangeMode
									rangeAnchor = null
									tapRangeAction = null
									setStatusMessage(
										useTapRangeMode
											? 'Tap-range mode enabled. Tap start, then tap end.'
											: null,
									)
								},
							}}
							css={{
								padding: `${spacing.xs} ${spacing.md}`,
								borderRadius: radius.full,
								border: `1px solid ${colors.border}`,
								backgroundColor: useTapRangeMode
									? colors.primary
									: 'transparent',
								color: useTapRangeMode ? colors.onPrimary : colors.text,
								cursor: 'pointer',
								fontWeight: typography.fontWeight.medium,
							}}
							aria-pressed={useTapRangeMode}
						>
							{useTapRangeMode ? 'Tap start/end mode on' : 'Tap start/end mode'}
						</button>
						<p css={{ margin: 0, color: colors.textMuted }}>
							Desktop: click and drag. Mobile: enable tap start/end mode.
						</p>
						<p css={{ margin: 0, color: colors.textMuted }}>
							Times are shown in your browser timezone: {browserTimeZone}
						</p>
					</div>

					{isLoading ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Loading schedule…
						</p>
					) : currentSnapshot ? (
						renderScheduleGrid({
							slots: currentSnapshot.slots,
							selectedSlots,
							pendingAddedSlots: pendingDiff.pendingAdded,
							pendingRemovedSlots: pendingDiff.pendingRemoved,
							mobileDayKey,
							slotAvailability,
							maxAvailabilityCount,
							activeSlot,
							rangeAnchor,
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
							{activeSlotPendingStatus ? (
								<p
									css={{
										margin: 0,
										color: colors.primaryText,
										fontSize: typography.fontSize.sm,
										fontWeight: typography.fontWeight.medium,
									}}
								>
									{activeSlotPendingStatus}
								</p>
							) : null}
						</section>
					) : null}

					<div
						css={{
							minHeight: '2.2rem',
							display: 'grid',
							alignItems: 'start',
						}}
					>
						<p
							role={saveError && showInlineStatus ? 'alert' : undefined}
							aria-live="polite"
							aria-hidden={showInlineStatus ? undefined : true}
							css={{
								margin: 0,
								color: saveError ? colors.error : colors.textMuted,
								fontSize: typography.fontSize.sm,
								opacity: showInlineStatus ? 1 : 0,
								transition: 'opacity 120ms ease',
							}}
						>
							{inlineStatusText}
						</p>
					</div>
				</section>
			</section>
		)
	}
}
