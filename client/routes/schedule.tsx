import { type Handle } from 'remix/component'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import {
	findSelectionForAttendee,
	normalizeName,
} from '#client/schedule-utils.ts'
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
	attendees: Array<{ id: string; name: string; isHost: boolean }>
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

export function ScheduleRoute(handle: Handle) {
	let shareToken = ''
	let attendeeName = ''
	let snapshot: Snapshot | null = null
	let selectedSlots = new Set<string>()
	let activeSlot: string | null = null
	let rangeAnchor: string | null = null
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

	function clearSocketResources() {
		if (socket) {
			socket.close()
			socket = null
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
		if (!shareToken) return
		try {
			const response = await fetch(`/api/schedules/${shareToken}`, {
				headers: { Accept: 'application/json' },
			})
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: Snapshot
				error?: string
			} | null
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

			if (attendeeName && !hasDirtyChanges) {
				const slots = findSelectionForAttendee({
					attendeeName,
					attendees: snapshot.attendees,
					availabilityByAttendee: snapshot.availabilityByAttendee,
				})
				selectedSlots = new Set(slots)
			}

			handle.update()
		} catch {
			isLoading = false
			setStatusMessage('Unable to load schedule.', true)
		}
	}

	async function saveAvailability() {
		if (!snapshot || !shareToken) return
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
				`/api/schedules/${shareToken}/availability`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: normalizedName,
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

			if (!response.ok || !payload?.ok || !payload.snapshot) {
				const errorMessage =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to save availability.'
				setStatusMessage(errorMessage, true)
				return
			}

			snapshot = payload.snapshot
			if (saveVersion === changeVersion) {
				hasDirtyChanges = false
				setStatusMessage('Availability saved.', false)
			}
		} catch {
			setStatusMessage('Network error while saving availability.', true)
		} finally {
			isSaving = false
			handle.update()
			const shouldReschedule =
				pendingSave && hasDirtyChanges && !handle.signal.aborted
			pendingSave = false
			if (shouldReschedule) {
				scheduleAutoSave()
			}
		}
	}

	function scheduleAutoSave() {
		if (saveDebounceTimer) {
			clearTimeout(saveDebounceTimer)
			saveDebounceTimer = null
		}
		if (handle.signal.aborted) return
		const normalizedName = normalizeName(attendeeName)
		if (!normalizedName) return
		if (isSaving) {
			pendingSave = true
			return
		}
		saveDebounceTimer = setTimeout(() => {
			void saveAvailability()
		}, 650)
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

	function applyRange(startSlot: string, endSlot: string) {
		if (!snapshot) return
		const startIndex = snapshot.slots.indexOf(startSlot)
		const endIndex = snapshot.slots.indexOf(endSlot)
		if (startIndex < 0 || endIndex < 0) return
		const min = Math.min(startIndex, endIndex)
		const max = Math.max(startIndex, endIndex)
		for (let index = min; index <= max; index += 1) {
			const slot = snapshot.slots[index]
			if (!slot) continue
			selectedSlots.add(slot)
		}
	}

	function handleCellPointerDown(slot: string, event: PointerEvent) {
		if (useTapRangeMode) return
		paintMode = selectedSlots.has(slot) ? 'remove' : 'add'
		dragging = true
		lastPointerSlot = slot
		setSlotSelection(slot, paintMode === 'add')
		;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
			event.pointerId,
		)
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
			activeSlot = slot
			setStatusMessage(
				'Range start selected. Tap another slot to set range end.',
			)
			return
		}
		applyRange(rangeAnchor, slot)
		rangeAnchor = null
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
				connectSocket()
			}, 1200)
		}
	}

	handle.queueTask(async () => {
		const nextPathname = getPathname()
		if (nextPathname === lastPathname) return
		lastPathname = nextPathname
		shareToken = parseShareToken(nextPathname)
		snapshot = null
		selectedSlots = new Set<string>()
		hasDirtyChanges = false
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
		const attendeeNames =
			currentSnapshot?.attendees.map((entry) => entry.name) ?? []
		const activeSlotAvailableNames = activeSlot
			? (currentSnapshot?.availableNamesBySlot[activeSlot] ?? [])
			: []
		const activeSlotUnavailableNames = attendeeNames.filter(
			(name) => !activeSlotAvailableNames.includes(name),
		)
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
										if (snapshot) {
											const existingSlots = findSelectionForAttendee({
												attendeeName,
												attendees: snapshot.attendees,
												availabilityByAttendee: snapshot.availabilityByAttendee,
											})
											if (existingSlots.length > 0) {
												selectedSlots = new Set(existingSlots)
											}
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
								}}
							>
								{isSaving ? 'Saving…' : 'Save availability'}
							</button>
							<p css={{ margin: 0, color: colors.textMuted }}>
								{selectedCount} selected slot{selectedCount === 1 ? '' : 's'}
								{hasDirtyChanges ? ' (unsaved changes)' : ''}
							</p>
						</div>
					</div>

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
					</div>

					{isLoading ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Loading schedule…
						</p>
					) : currentSnapshot ? (
						renderScheduleGrid({
							slots: currentSnapshot.slots,
							selectedSlots,
							slotAvailability,
							maxAvailabilityCount,
							activeSlot,
							rangeAnchor,
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
							<p css={{ margin: 0, color: colors.text }}>
								Available: {activeSlotAvailableNames.join(', ') || 'None'}
							</p>
							<p css={{ margin: 0, color: colors.textMuted }}>
								Unavailable: {activeSlotUnavailableNames.join(', ') || 'None'}
							</p>
						</section>
					) : null}

					{saveMessage ? (
						<p
							role={saveError ? 'alert' : undefined}
							css={{
								margin: 0,
								color: saveError ? colors.error : colors.textMuted,
								fontSize: typography.fontSize.sm,
							}}
						>
							{saveMessage}
						</p>
					) : null}
				</section>
			</section>
		)
	}
}
