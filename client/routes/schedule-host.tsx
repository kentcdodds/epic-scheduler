import { type Handle } from 'remix/component'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import { toDayKey } from '#client/schedule-utils.ts'
import { type ScheduleSnapshot } from '#shared/schedule-store.ts'
import {
	colors,
	mq,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'

type PreviewMode = 'all' | 'count'
type ConnectionState = 'connecting' | 'live' | 'offline'

function parseHostRouteParams(pathname: string) {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length !== 3) return null
	if (segments[0] !== 's') return null
	let shareToken = ''
	let hostAccessToken = ''
	try {
		shareToken = decodeURIComponent(segments[1] ?? '').trim()
		hostAccessToken = decodeURIComponent(segments[2] ?? '').trim()
	} catch {
		return null
	}
	if (!shareToken || !hostAccessToken) return null
	return { shareToken, hostAccessToken }
}

function getPathname() {
	if (typeof window === 'undefined') return '/'
	return window.location.pathname
}

function toWebSocketUrl(path: string) {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${path}`
}

function toSet(values: Array<string>) {
	return new Set(values)
}

function areSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
	if (left.size !== right.size) return false
	for (const value of left) {
		if (!right.has(value)) return false
	}
	return true
}

function formatSlotLabel(slot: string) {
	return new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(new Date(slot))
}

function buildEmptyAvailability(slots: Array<string>) {
	return Object.fromEntries(
		slots.map((slot) => [
			slot,
			{ count: 0, availableNames: [] as Array<string> },
		]),
	)
}

function renderCopyIcon() {
	return (
		<svg
			aria-hidden
			viewBox="0 0 24 24"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
	)
}

function copyTextWithFallback(text: string) {
	if (typeof document === 'undefined') return false
	const textarea = document.createElement('textarea')
	textarea.value = text
	textarea.setAttribute('readonly', 'true')
	textarea.style.position = 'absolute'
	textarea.style.left = '-9999px'
	document.body.appendChild(textarea)
	textarea.select()
	let copied = false
	try {
		copied = document.execCommand('copy')
	} catch {
		copied = false
	}
	document.body.removeChild(textarea)
	return copied
}

export function ScheduleHostRoute(handle: Handle) {
	let shareToken = ''
	let hostAccessToken = ''
	let snapshot: ScheduleSnapshot | null = null
	let titleDraft = ''
	let blockedSlots = new Set<string>()
	let persistedBlockedSlots = new Set<string>()
	let excludedAttendeeIds = new Set<string>()
	let previewMode: PreviewMode = 'all'
	let activePreviewSlot: string | null = null
	let previewTooltip: {
		slot: string
		clientX: number
		clientY: number
	} | null = null
	let mobileDayKey: string | null = null
	let hostPaintMode: 'add' | 'remove' | null = null
	let hostDragging = false
	let hostLastPointerSlot: string | null = null
	let isLoading = true
	let isSaving = false
	let pendingSave = false
	let connectionState: ConnectionState = 'connecting'
	let socket: WebSocket | null = null
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null
	let changeVersion = 0
	let statusMessage: string | null = null
	let statusError = false
	let clipboardMessage: string | null = null
	let clipboardError = false
	let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
	let clipboardMessageTimer: ReturnType<typeof setTimeout> | null = null
	let refreshTimer: ReturnType<typeof setInterval> | null = null
	let lastPathname = ''
	let snapshotRequestId = 0
	const saveDebounceMs = 600
	const refreshIntervalMs = 5000
	const reconnectDelayMs = 1800

	function setStatus(message: string | null, error = false) {
		statusMessage = message
		statusError = error
		handle.update()
	}

	function clearSaveDebounceTimer() {
		if (!saveDebounceTimer) return
		clearTimeout(saveDebounceTimer)
		saveDebounceTimer = null
	}

	function clearClipboardMessageTimer() {
		if (!clipboardMessageTimer) return
		clearTimeout(clipboardMessageTimer)
		clipboardMessageTimer = null
	}

	function clearRefreshTimer() {
		if (!refreshTimer) return
		clearInterval(refreshTimer)
		refreshTimer = null
	}

	function clearReconnectTimer() {
		if (!reconnectTimer) return
		clearTimeout(reconnectTimer)
		reconnectTimer = null
	}

	function clearSocketResources() {
		clearReconnectTimer()
		const currentSocket = socket
		socket = null
		if (
			currentSocket &&
			(currentSocket.readyState === WebSocket.CONNECTING ||
				currentSocket.readyState === WebSocket.OPEN)
		) {
			currentSocket.close()
		}
	}

	function cleanupResources() {
		clearSaveDebounceTimer()
		clearClipboardMessageTimer()
		clearSocketResources()
		clearRefreshTimer()
		pendingSave = false
	}

	function setConnectionState(nextState: ConnectionState) {
		connectionState = nextState
		if (nextState === 'offline') {
			if (!refreshTimer) {
				refreshTimer = setInterval(() => {
					if (hasLocalHostChanges()) return
					void loadSnapshot()
				}, refreshIntervalMs)
			}
		} else {
			clearRefreshTimer()
		}
		handle.update()
	}

	function setClipboardStatus(nextMessage: string | null, error = false) {
		clipboardMessage = nextMessage
		clipboardError = error
		clearClipboardMessageTimer()
		if (nextMessage) {
			clipboardMessageTimer = setTimeout(() => {
				clipboardMessage = null
				clipboardError = false
				handle.update()
			}, 2200)
		}
		handle.update()
	}

	async function copyValueToClipboard(label: string, value: string) {
		const normalized = value.trim()
		if (!normalized) {
			setClipboardStatus(`Unable to copy ${label.toLowerCase()}.`, true)
			return
		}
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(normalized)
				setClipboardStatus(`${label} copied.`)
				return
			}
			const copied = copyTextWithFallback(normalized)
			if (copied) {
				setClipboardStatus(`${label} copied.`)
				return
			}
			setClipboardStatus(`Unable to copy ${label.toLowerCase()}.`, true)
		} catch {
			const copied = copyTextWithFallback(normalized)
			if (copied) {
				setClipboardStatus(`${label} copied.`)
				return
			}
			setClipboardStatus(`Unable to copy ${label.toLowerCase()}.`, true)
		}
	}

	if (handle.signal.aborted) {
		cleanupResources()
	} else {
		handle.signal.addEventListener('abort', cleanupResources)
	}

	function hasLocalHostChanges() {
		if (!snapshot) return false
		const titleChanged = titleDraft.trim() !== snapshot.schedule.title.trim()
		const blockedChanged = !areSetsEqual(blockedSlots, persistedBlockedSlots)
		return titleChanged || blockedChanged
	}

	function applySnapshot(nextSnapshot: ScheduleSnapshot) {
		const keepLocalTitle =
			!!snapshot && titleDraft.trim() !== snapshot.schedule.title.trim()
		const keepLocalBlocked =
			!!snapshot && !areSetsEqual(blockedSlots, persistedBlockedSlots)
		const nextBlockedSlots = toSet(nextSnapshot.blockedSlots)
		snapshot = nextSnapshot
		persistedBlockedSlots = new Set(nextBlockedSlots)
		if (!keepLocalTitle) {
			titleDraft = nextSnapshot.schedule.title
		}
		if (!keepLocalBlocked) {
			blockedSlots = new Set(nextBlockedSlots)
		}
		const validAttendeeIds = new Set(
			nextSnapshot.attendees.map((entry) => entry.id),
		)
		const nextDayKeys = Array.from(
			new Set(
				nextSnapshot.slots
					.map((slot) => toDayKey(slot))
					.filter((value): value is string => value !== null),
			),
		)
		if (!mobileDayKey || !nextDayKeys.includes(mobileDayKey)) {
			mobileDayKey = nextDayKeys[0] ?? null
		}
		excludedAttendeeIds = new Set(
			Array.from(excludedAttendeeIds).filter((id) => validAttendeeIds.has(id)),
		)
		if (activePreviewSlot && !nextSnapshot.slots.includes(activePreviewSlot)) {
			activePreviewSlot = null
		}
		handle.update()
	}

	async function loadSnapshot() {
		const requestShareToken = shareToken
		if (!requestShareToken || handle.signal.aborted) return
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
						: 'Unable to load host dashboard.'
				setStatus(errorText, true)
				isLoading = false
				handle.update()
				return
			}
			applySnapshot(payload.snapshot)
			isLoading = false
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
			setStatus('Unable to load host dashboard.', true)
		}
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
					if (payload?.type === 'schedule-updated' && !hasLocalHostChanges()) {
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

	async function saveHostSettings() {
		const requestShareToken = shareToken
		const currentSnapshot = snapshot
		if (!requestShareToken || !currentSnapshot) return
		if (isSaving) {
			pendingSave = true
			return
		}
		const requestHostAccessToken = hostAccessToken
		if (!requestHostAccessToken) {
			setStatus('Host access token missing.', true)
			return
		}
		const title = titleDraft.trim() || 'New schedule'
		const sortedBlockedSlots = Array.from(blockedSlots).sort((left, right) =>
			left.localeCompare(right),
		)
		const saveVersion = changeVersion
		isSaving = true
		handle.update()
		try {
			const response = await fetch(`/api/schedules/${requestShareToken}/host`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Host-Token': requestHostAccessToken,
				},
				body: JSON.stringify({
					title,
					blockedSlots: sortedBlockedSlots,
				}),
			})
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				snapshot?: ScheduleSnapshot
				error?: string
			} | null
			if (requestShareToken !== shareToken || handle.signal.aborted) return
			if (!response.ok || !payload?.ok || !payload.snapshot) {
				const errorText =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to save host dashboard changes.'
				setStatus(errorText, true)
				return
			}
			const hadQueuedLocalChanges = pendingSave
			const nextBlockedSlots = toSet(payload.snapshot.blockedSlots)
			snapshot = payload.snapshot
			persistedBlockedSlots = new Set(nextBlockedSlots)
			if (!hadQueuedLocalChanges && saveVersion === changeVersion) {
				titleDraft = payload.snapshot.schedule.title
				blockedSlots = new Set(nextBlockedSlots)
			}
			setStatus('Host settings synced.')
			handle.update()
		} catch {
			if (requestShareToken !== shareToken || handle.signal.aborted) return
			setStatus('Network error while saving host settings.', true)
		} finally {
			if (requestShareToken === shareToken && !handle.signal.aborted) {
				isSaving = false
				handle.update()
				const shouldReschedule = pendingSave && hasLocalHostChanges()
				pendingSave = false
				if (shouldReschedule) {
					queueHostSettingsSave()
				}
			} else {
				pendingSave = false
			}
		}
	}

	function queueHostSettingsSave() {
		clearSaveDebounceTimer()
		if (handle.signal.aborted) return
		if (!snapshot) return
		if (!hasLocalHostChanges()) return
		if (isSaving) {
			pendingSave = true
			return
		}
		saveDebounceTimer = setTimeout(() => {
			void saveHostSettings()
		}, saveDebounceMs)
		handle.update()
	}

	function setBlockedSlotState(slot: string, shouldBeBlocked: boolean) {
		const currentlyBlocked = blockedSlots.has(slot)
		if (currentlyBlocked === shouldBeBlocked) return false
		if (shouldBeBlocked) {
			blockedSlots.add(slot)
		} else {
			blockedSlots.delete(slot)
		}
		changeVersion += 1
		queueHostSettingsSave()
		return true
	}

	function toggleBlockedSlot(slot: string) {
		const changed = setBlockedSlotState(slot, !blockedSlots.has(slot))
		if (changed) {
			handle.update()
		}
	}

	function handleHostUnavailablePointerUp() {
		hostDragging = false
		hostPaintMode = null
		hostLastPointerSlot = null
	}

	function handleHostUnavailablePointerDown(slot: string) {
		hostPaintMode = blockedSlots.has(slot) ? 'remove' : 'add'
		hostDragging = true
		hostLastPointerSlot = slot
		const changed = setBlockedSlotState(slot, hostPaintMode === 'add')
		if (typeof window !== 'undefined') {
			window.addEventListener('pointerup', handleHostUnavailablePointerUp, {
				once: true,
			})
		}
		if (changed) {
			handle.update()
		}
	}

	function handleHostUnavailablePointerEnter(slot: string) {
		if (!hostDragging || !hostPaintMode) return
		if (hostLastPointerSlot === slot) return
		hostLastPointerSlot = slot
		const changed = setBlockedSlotState(slot, hostPaintMode === 'add')
		if (changed) {
			handle.update()
		}
	}

	function toggleIncludedAttendee(attendeeId: string) {
		if (excludedAttendeeIds.has(attendeeId)) {
			excludedAttendeeIds.delete(attendeeId)
		} else {
			excludedAttendeeIds.add(attendeeId)
		}
		handle.update()
	}

	handle.queueTask(async () => {
		const nextPathname = getPathname()
		if (nextPathname === lastPathname) return
		lastPathname = nextPathname
		clearSaveDebounceTimer()
		clearSocketResources()
		clearRefreshTimer()
		const routeParams = parseHostRouteParams(nextPathname)
		shareToken = routeParams?.shareToken ?? ''
		hostAccessToken = routeParams?.hostAccessToken ?? ''
		snapshot = null
		titleDraft = ''
		blockedSlots = new Set<string>()
		persistedBlockedSlots = new Set<string>()
		excludedAttendeeIds = new Set<string>()
		previewMode = 'all'
		activePreviewSlot = null
		previewTooltip = null
		mobileDayKey = null
		hostPaintMode = null
		hostDragging = false
		hostLastPointerSlot = null
		isLoading = true
		isSaving = false
		pendingSave = false
		connectionState = 'offline'
		setStatus(null, false)
		await loadSnapshot()
		if (shareToken && hostAccessToken) {
			connectSocket()
		}
	})

	return () => {
		if (!shareToken || !hostAccessToken) {
			return (
				<section css={{ display: 'grid', gap: spacing.md }}>
					<h2 css={{ margin: 0, color: colors.text }}>
						Host dashboard not found
					</h2>
					<p css={{ margin: 0, color: colors.textMuted }}>
						This link is invalid.
					</p>
				</section>
			)
		}

		const currentSnapshot = snapshot
		const attendees = currentSnapshot?.attendees ?? []
		const includedAttendees = attendees.filter(
			(attendee) => !excludedAttendeeIds.has(attendee.id),
		)
		const includedAttendeeCount = includedAttendees.length
		const includedAvailabilityById = new Map(
			includedAttendees.map((attendee) => [
				attendee.id,
				new Set(currentSnapshot?.availabilityByAttendee[attendee.id] ?? []),
			]),
		)
		const allAvailabilityById = new Map(
			attendees.map((attendee) => [
				attendee.id,
				new Set(currentSnapshot?.availabilityByAttendee[attendee.id] ?? []),
			]),
		)
		const blockedSlotsSorted = Array.from(blockedSlots).sort((left, right) =>
			left.localeCompare(right),
		)
		const previewAvailability: Record<
			string,
			{ count: number; availableNames: Array<string> }
		> = {}
		const allAvailableSlots = new Set<string>()
		const slots = currentSnapshot?.slots ?? []
		for (const slot of slots) {
			if (blockedSlots.has(slot)) {
				previewAvailability[slot] = { count: 0, availableNames: [] }
				continue
			}
			const availableNames = includedAttendees
				.filter((attendee) =>
					includedAvailabilityById.get(attendee.id)?.has(slot),
				)
				.map((attendee) => attendee.name)
			const count = availableNames.length
			const allIncludedCanAttend =
				includedAttendeeCount > 0 && count === includedAttendeeCount
			if (allIncludedCanAttend) {
				allAvailableSlots.add(slot)
			}
			previewAvailability[slot] =
				previewMode === 'all'
					? {
							count: allIncludedCanAttend ? includedAttendeeCount : 0,
							availableNames,
						}
					: {
							count,
							availableNames,
						}
		}
		const previewMaxCount = Math.max(1, includedAttendeeCount)
		const bestSlots = slots
			.filter((slot) => !blockedSlots.has(slot))
			.map((slot) => ({
				slot,
				count: includedAttendees.filter((attendee) =>
					includedAvailabilityById.get(attendee.id)?.has(slot),
				).length,
			}))
			.sort((left, right) => {
				if (right.count !== left.count) return right.count - left.count
				return left.slot.localeCompare(right.slot)
			})
			.slice(0, 5)
		const blockedAvailability = currentSnapshot
			? buildEmptyAvailability(currentSnapshot.slots)
			: {}
		const hasPendingLocalChanges = hasLocalHostChanges() || isSaving
		const activePreviewSlotValue = activePreviewSlot
		const activeSlotDetails = activePreviewSlotValue
			? {
					slot: activePreviewSlotValue,
					isBlocked: blockedSlots.has(activePreviewSlotValue),
					availableSet: new Set(
						includedAttendees
							.filter((attendee) =>
								includedAvailabilityById
									.get(attendee.id)
									?.has(activePreviewSlotValue),
							)
							.map((attendee) => attendee.id),
					),
				}
			: null
		const hoveredPreviewSlot = previewTooltip?.slot ?? null
		const hoveredPreviewSlotDetails =
			hoveredPreviewSlot && currentSnapshot?.slots.includes(hoveredPreviewSlot)
				? {
						slot: hoveredPreviewSlot,
						isBlocked: blockedSlots.has(hoveredPreviewSlot),
						availableSet: new Set(
							attendees
								.filter((attendee) =>
									allAvailabilityById.get(attendee.id)?.has(hoveredPreviewSlot),
								)
								.map((attendee) => attendee.id),
						),
					}
				: null
		const tooltipWidthPx = 300
		const viewportWidth =
			typeof window === 'undefined' ? 1440 : window.innerWidth
		const viewportHeight =
			typeof window === 'undefined' ? 900 : window.innerHeight
		const tooltipLeft = previewTooltip
			? Math.max(
					12,
					Math.min(
						previewTooltip.clientX + 16,
						viewportWidth - tooltipWidthPx - 12,
					),
				)
			: 0
		const tooltipTop = previewTooltip
			? Math.max(
					12,
					Math.min(previewTooltip.clientY + 16, viewportHeight - 220),
				)
			: 0
		const connectionLabel =
			connectionState === 'live'
				? 'Realtime connected'
				: connectionState === 'connecting'
					? 'Connecting realtime…'
					: `Realtime unavailable; polling every ${Math.floor(refreshIntervalMs / 1000)}s`
		const appOrigin =
			typeof window === 'undefined' ? '' : window.location.origin
		const attendeePath = `/s/${encodeURIComponent(shareToken)}`
		const hostPath = `${attendeePath}/${encodeURIComponent(hostAccessToken)}`
		const attendeeUrl = appOrigin ? `${appOrigin}${attendeePath}` : attendeePath
		const hostUrl = appOrigin ? `${appOrigin}${hostPath}` : hostPath

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
							'linear-gradient(140deg, color-mix(in srgb, var(--color-primary) 24%, var(--color-surface)), color-mix(in srgb, var(--color-primary) 8%, var(--color-background)))',
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
						Host dashboard
					</h1>
					<p css={{ margin: 0, color: colors.textMuted }}>
						Manage schedule settings and choose the best meeting slot.
					</p>
					<p css={{ margin: 0, color: colors.textMuted }}>{connectionLabel}</p>
					<p css={{ margin: 0, color: colors.text }}>Save these links.</p>
					<div
						css={{
							display: 'grid',
							gap: spacing.sm,
							padding: spacing.md,
							borderRadius: radius.md,
							backgroundColor:
								'color-mix(in srgb, var(--color-surface) 72%, transparent)',
							border: `1px solid ${colors.border}`,
						}}
					>
						<div css={{ display: 'grid', gap: spacing.xs }}>
							<p css={{ margin: 0, color: colors.textMuted }}>
								Attendee submission link
							</p>
							<div
								css={{
									display: 'grid',
									gap: spacing.xs,
									gridTemplateColumns: 'minmax(0, 1fr) auto',
									alignItems: 'center',
								}}
							>
								<code
									css={{
										display: 'block',
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radius.sm,
										border: `1px solid ${colors.border}`,
										backgroundColor: colors.background,
										color: colors.text,
										overflowWrap: 'anywhere',
									}}
								>
									{attendeeUrl}
								</code>
								<button
									type="button"
									aria-label="Copy attendee submission link"
									on={{
										click: () =>
											void copyValueToClipboard('Attendee link', attendeeUrl),
									}}
									css={{
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										width: 34,
										height: 34,
										padding: 0,
										borderRadius: radius.sm,
										border: `1px solid ${colors.border}`,
										backgroundColor: colors.surface,
										color: colors.text,
										cursor: 'pointer',
									}}
								>
									{renderCopyIcon()}
								</button>
							</div>
						</div>

						<div css={{ display: 'grid', gap: spacing.xs }}>
							<p css={{ margin: 0, color: colors.textMuted }}>
								Host dashboard link
							</p>
							<div
								css={{
									display: 'grid',
									gap: spacing.xs,
									gridTemplateColumns: 'minmax(0, 1fr) auto',
									alignItems: 'center',
								}}
							>
								<code
									css={{
										display: 'block',
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radius.sm,
										border: `1px solid ${colors.border}`,
										backgroundColor: colors.background,
										color: colors.text,
										overflowWrap: 'anywhere',
									}}
								>
									{hostUrl}
								</code>
								<button
									type="button"
									aria-label="Copy host dashboard link"
									on={{
										click: () =>
											void copyValueToClipboard('Host link', hostUrl),
									}}
									css={{
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										width: 34,
										height: 34,
										padding: 0,
										borderRadius: radius.sm,
										border: `1px solid ${colors.border}`,
										backgroundColor: colors.surface,
										color: colors.text,
										cursor: 'pointer',
									}}
								>
									{renderCopyIcon()}
								</button>
							</div>
						</div>
					</div>
					{clipboardMessage ? (
						<p
							role={clipboardError ? 'alert' : undefined}
							aria-live="polite"
							css={{
								margin: 0,
								color: clipboardError ? colors.error : colors.textMuted,
							}}
						>
							{clipboardMessage}
						</p>
					) : null}
				</header>

				<section
					css={{
						display: 'grid',
						gap: spacing.lg,
						padding: spacing.lg,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						backgroundColor: colors.surface,
						boxShadow: shadows.sm,
					}}
				>
					{isLoading ? (
						<p css={{ margin: 0, color: colors.textMuted }}>
							Loading host dashboard…
						</p>
					) : currentSnapshot ? (
						<>
							<label css={{ display: 'grid', gap: spacing.xs }}>
								<span
									css={{ color: colors.text, fontSize: typography.fontSize.sm }}
								>
									Schedule title
								</span>
								<input
									type="text"
									value={titleDraft}
									on={{
										input: (event) => {
											const nextTitle = event.currentTarget.value
											if (nextTitle === titleDraft) return
											titleDraft = nextTitle
											changeVersion += 1
											queueHostSettingsSave()
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

							<section
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
									Respondents
								</h2>
								<p css={{ margin: 0, color: colors.textMuted }}>
									Click a name to include/exclude them in the preview. Hidden
									checkboxes stay keyboard-accessible.
								</p>
								<div
									css={{
										display: 'flex',
										flexWrap: 'wrap',
										gap: spacing.sm,
									}}
								>
									{attendees.map((attendee) => {
										const isIncluded = !excludedAttendeeIds.has(attendee.id)
										return (
											<label
												key={attendee.id}
												css={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: spacing.xs,
													padding: `${spacing.xs} ${spacing.sm}`,
													borderRadius: radius.full,
													border: `1px solid ${colors.border}`,
													backgroundColor: isIncluded
														? colors.surface
														: colors.background,
													cursor: 'pointer',
												}}
											>
												<input
													type="checkbox"
													checked={isIncluded}
													on={{
														change: () => toggleIncludedAttendee(attendee.id),
													}}
													css={{
														position: 'absolute',
														width: 1,
														height: 1,
														padding: 0,
														margin: -1,
														overflow: 'hidden',
														clip: 'rect(0, 0, 0, 0)',
														whiteSpace: 'nowrap',
														border: 0,
													}}
												/>
												<span
													css={{
														color: colors.text,
														textDecoration: isIncluded
															? 'none'
															: 'line-through',
													}}
												>
													{attendee.name}
												</span>
											</label>
										)
									})}
								</div>
							</section>

							<section
								css={{
									display: 'grid',
									gap: spacing.sm,
								}}
							>
								<div
									css={{
										display: 'flex',
										flexWrap: 'wrap',
										alignItems: 'center',
										gap: spacing.sm,
										justifyContent: 'space-between',
									}}
								>
									<h2
										css={{
											margin: 0,
											fontSize: typography.fontSize.base,
											color: colors.text,
										}}
									>
										Best-time preview
									</h2>
									<div
										css={{
											display: 'inline-flex',
											gap: spacing.xs,
											padding: spacing.xs,
											borderRadius: radius.full,
											border: `1px solid ${colors.border}`,
											backgroundColor: colors.background,
										}}
									>
										<button
											type="button"
											on={{
												click: () => {
													previewMode = 'all'
													handle.update()
												},
											}}
											css={{
												padding: `${spacing.xs} ${spacing.sm}`,
												borderRadius: radius.full,
												border: 'none',
												backgroundColor:
													previewMode === 'all'
														? colors.primary
														: 'transparent',
												color:
													previewMode === 'all'
														? colors.onPrimary
														: colors.text,
												cursor: 'pointer',
											}}
										>
											All selected attendees
										</button>
										<button
											type="button"
											on={{
												click: () => {
													previewMode = 'count'
													handle.update()
												},
											}}
											css={{
												padding: `${spacing.xs} ${spacing.sm}`,
												borderRadius: radius.full,
												border: 'none',
												backgroundColor:
													previewMode === 'count'
														? colors.primary
														: 'transparent',
												color:
													previewMode === 'count'
														? colors.onPrimary
														: colors.text,
												cursor: 'pointer',
											}}
										>
											Count available attendees
										</button>
									</div>
								</div>
								<p css={{ margin: 0, color: colors.textMuted }}>
									Green slots mean everyone currently included can attend.
								</p>
								{renderScheduleGrid({
									slots: currentSnapshot.slots,
									selectedSlots: new Set<string>(),
									readOnly: true,
									selectedSlotLabel: 'selected in host preview',
									unselectedSlotLabel: 'host preview slot',
									disabledSlots: blockedSlots,
									highlightedSlots: allAvailableSlots,
									highlightedSlotLabel: 'all selected attendees can attend',
									slotAvailability: previewAvailability,
									maxAvailabilityCount: previewMaxCount,
									activeSlot: activePreviewSlot,
									rangeAnchor: null,
									mobileDayKey,
									pending: false,
									onMobileDayChange: (dayKey) => {
										mobileDayKey = dayKey
										handle.update()
									},
									onCellHover: (slot) => {
										activePreviewSlot = slot
										if (!slot) {
											previewTooltip = null
										}
										handle.update()
									},
									onCellPointerMove: (slot, event) => {
										if (event.pointerType !== 'mouse') return
										activePreviewSlot = slot
										previewTooltip = {
											slot,
											clientX: event.clientX,
											clientY: event.clientY,
										}
										handle.update()
									},
									onCellFocus: (slot) => {
										activePreviewSlot = slot
										previewTooltip = null
										handle.update()
									},
									onCellClick: (slot, _event) => {
										activePreviewSlot = slot
										previewTooltip = null
										handle.update()
									},
								})}
								{hoveredPreviewSlotDetails && previewTooltip ? (
									<aside
										role="note"
										data-host-hover-tooltip
										aria-live="polite"
										css={{
											position: 'fixed',
											left: tooltipLeft,
											top: tooltipTop,
											zIndex: 40,
											width: `min(${tooltipWidthPx}px, calc(100vw - 1.5rem))`,
											display: 'grid',
											gap: spacing.xs,
											padding: spacing.sm,
											borderRadius: radius.md,
											border: `1px solid ${colors.border}`,
											backgroundColor: colors.surface,
											boxShadow: shadows.md,
											pointerEvents: 'none',
										}}
									>
										<p css={{ margin: 0, color: colors.text, fontWeight: 600 }}>
											{formatSlotLabel(hoveredPreviewSlotDetails.slot)}
										</p>
										{hoveredPreviewSlotDetails.isBlocked ? (
											<p css={{ margin: 0, color: colors.error }}>
												Host marked this slot unavailable.
											</p>
										) : null}
										<ul
											css={{
												margin: 0,
												paddingLeft: '1rem',
												display: 'grid',
												gap: spacing.xs,
											}}
										>
											{attendees.map((attendee) => {
												const canAttend =
													!hoveredPreviewSlotDetails.isBlocked &&
													hoveredPreviewSlotDetails.availableSet.has(
														attendee.id,
													)
												return (
													<li
														key={`hover-slot-attendee-${attendee.id}`}
														css={{
															textDecoration: canAttend
																? 'none'
																: 'line-through',
															color: canAttend ? colors.text : colors.textMuted,
														}}
													>
														{attendee.name}
													</li>
												)
											})}
										</ul>
									</aside>
								) : null}
								{activeSlotDetails ? (
									<section
										css={{
											display: 'grid',
											gap: spacing.xs,
											padding: spacing.md,
											borderRadius: radius.md,
											border: `1px solid ${colors.border}`,
											backgroundColor: colors.background,
										}}
									>
										<p css={{ margin: 0, color: colors.text, fontWeight: 600 }}>
											{formatSlotLabel(activeSlotDetails.slot)}
										</p>
										{activeSlotDetails.isBlocked ? (
											<p css={{ margin: 0, color: colors.error }}>
												Host marked this slot unavailable.
											</p>
										) : (
											<ul
												css={{
													margin: 0,
													paddingLeft: '1rem',
													display: 'grid',
													gap: spacing.xs,
												}}
											>
												{includedAttendees.map((attendee) => (
													<li
														key={`slot-attendee-${attendee.id}`}
														css={{
															textDecoration:
																activeSlotDetails.availableSet.has(attendee.id)
																	? 'none'
																	: 'line-through',
															color: activeSlotDetails.availableSet.has(
																attendee.id,
															)
																? colors.text
																: colors.textMuted,
														}}
													>
														{attendee.name}
													</li>
												))}
											</ul>
										)}
									</section>
								) : null}
							</section>

							<section
								css={{
									display: 'grid',
									gap: spacing.sm,
								}}
							>
								<h2
									css={{
										margin: 0,
										fontSize: typography.fontSize.base,
										color: colors.text,
									}}
								>
									Host unavailable slots
								</h2>
								<p css={{ margin: 0, color: colors.textMuted }}>
									Click slots to mark them completely unavailable for everyone.
								</p>
								{renderScheduleGrid({
									slots: currentSnapshot.slots,
									selectedSlots: blockedSlots,
									selectedSlotLabel: 'marked unavailable by host',
									unselectedSlotLabel: 'available for scheduling',
									selectedBackground:
										'color-mix(in srgb, var(--color-error) 34%, var(--color-surface))',
									slotAvailability: blockedAvailability,
									maxAvailabilityCount: 1,
									activeSlot: null,
									rangeAnchor: null,
									mobileDayKey,
									pending: hasPendingLocalChanges,
									onMobileDayChange: (dayKey) => {
										mobileDayKey = dayKey
										handle.update()
									},
									onCellPointerDown: (slot, _event) => {
										handleHostUnavailablePointerDown(slot)
									},
									onCellPointerEnter: (slot, _event) => {
										handleHostUnavailablePointerEnter(slot)
									},
									onCellPointerUp: (_slot, _event) => {
										handleHostUnavailablePointerUp()
									},
									onCellClick: (slot, event) => {
										if (event.detail > 0) return
										toggleBlockedSlot(slot)
									},
								})}
								<p css={{ margin: 0, color: colors.textMuted }}>
									{blockedSlots.size} blocked slot
									{blockedSlots.size === 1 ? '' : 's'}
								</p>
							</section>

							<section
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
									Best options
								</h2>
								<ul
									css={{
										margin: 0,
										paddingLeft: '1rem',
										display: 'grid',
										gap: spacing.xs,
									}}
								>
									{bestSlots.map((entry) => (
										<li key={`best-slot-${entry.slot}`}>
											<strong>{formatSlotLabel(entry.slot)}</strong> —{' '}
											{entry.count}/{includedAttendeeCount} selected attendee
											{includedAttendeeCount === 1 ? '' : 's'} available
										</li>
									))}
								</ul>
								{bestSlots.length === 0 ? (
									<p css={{ margin: 0, color: colors.textMuted }}>
										No slots available after host blocks.
									</p>
								) : null}
							</section>
						</>
					) : (
						<p css={{ margin: 0, color: colors.error }}>
							Schedule not found or unavailable.
						</p>
					)}

					<div
						css={{
							display: 'grid',
							gap: spacing.xs,
							gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
							[mq.mobile]: {
								gridTemplateColumns: '1fr',
							},
						}}
					>
						<p css={{ margin: 0, color: colors.textMuted }}>
							Blocked slots synced: {persistedBlockedSlots.size}
						</p>
						<p css={{ margin: 0, color: colors.textMuted, textAlign: 'right' }}>
							Last blocked slot: {blockedSlotsSorted.at(-1) ?? 'none'}
						</p>
					</div>
					{statusMessage ? (
						<p
							role={statusError ? 'alert' : undefined}
							aria-live="polite"
							css={{
								margin: 0,
								color: statusError ? colors.error : colors.textMuted,
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
