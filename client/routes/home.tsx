import { type Handle } from 'remix/component'
import { navigate } from '#client/client-router.tsx'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import {
	computeAutoScrollStep,
	findSlotAtPoint,
	getGridScrollerFromPointerEvent,
	setPointerCaptureIfAvailable,
} from '#client/grid-drag-autoscroll.ts'
import {
	addDays,
	createSlotRangeFromDateInputs,
	formatDateInputValue,
	getRectangularSlotSelection,
} from '#client/schedule-utils.ts'
import {
	detectTapRangeMode,
	getTapRangeStartMessage,
	isTapRangeStartMessage,
	resolveTapRangeModeFromPointer,
} from '#client/tap-range-mode.ts'
import {
	colors,
	mq,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'

type RequestStatus = 'idle' | 'saving' | 'error'

function buildDefaultSelection(slots: Array<string>) {
	const selected = new Set<string>()
	for (const slot of slots) {
		const date = new Date(slot)
		const day = date.getDay()
		const hour = date.getHours()
		const isWeekday = day >= 1 && day <= 5
		const isWorkHour = hour >= 9 && hour < 17
		if (isWeekday && isWorkHour) {
			selected.add(slot)
		}
	}
	return selected
}

function getBrowserTimeZone() {
	const value = Intl.DateTimeFormat().resolvedOptions().timeZone
	if (typeof value !== 'string') return 'UTC'
	const normalized = value.trim()
	return normalized || 'UTC'
}

export function HomeRoute(handle: Handle) {
	const today = new Date()
	const browserTimeZone = getBrowserTimeZone()
	let title = ''
	let hostName = ''
	let intervalMinutes = 30
	let startDateInput = formatDateInputValue(today)
	let endDateInput = formatDateInputValue(addDays(today, 6))
	let generatedSlots: Array<string> = []
	let rangeStartUtc = ''
	let rangeEndUtc = ''
	let selectedSlots = new Set<string>()
	let rangeAnchor: string | null = null
	let tapRangeAction: 'add' | 'remove' | null = null
	let activeSlot: string | null = null
	let mobileDayKey: string | null = null
	let status: RequestStatus = 'idle'
	let message: string | null = null
	let useTapRangeMode = detectTapRangeMode()
	let pointerSelectionMode: 'add' | 'remove' | null = null
	let pointerSelectionStartSlot: string | null = null
	let pointerSelectionEndSlot: string | null = null
	let pointerSelectionSlots = new Set<string>()
	let pointerSelectionScroller: HTMLElement | null = null
	let pointerPointerX = 0
	let pointerPointerY = 0
	let pointerAutoScrollRaf: number | null = null
	let didInitializeSelection = false

	function syncSlots() {
		const nextRange = createSlotRangeFromDateInputs({
			startDateInput,
			endDateInput,
			intervalMinutes,
		})
		rangeStartUtc = nextRange.rangeStartUtc
		rangeEndUtc = nextRange.rangeEndUtc
		generatedSlots = nextRange.slots

		if (!didInitializeSelection) {
			selectedSlots = buildDefaultSelection(generatedSlots)
			didInitializeSelection = true
			return
		}

		const validSlots = new Set(generatedSlots)
		selectedSlots = new Set(
			Array.from(selectedSlots).filter((slot) => validSlots.has(slot)),
		)
	}

	function setMessage(nextStatus: RequestStatus, text: string | null) {
		status = nextStatus
		message = text
		handle.update()
	}

	function updateDateRange(next: {
		startDateInput?: string
		endDateInput?: string
		intervalMinutes?: number
	}) {
		if (next.startDateInput !== undefined) startDateInput = next.startDateInput
		if (next.endDateInput !== undefined) endDateInput = next.endDateInput
		if (next.intervalMinutes !== undefined)
			intervalMinutes = next.intervalMinutes
		try {
			syncSlots()
			setMessage('idle', null)
		} catch (error) {
			const text = error instanceof Error ? error.message : 'Invalid range.'
			setMessage('error', text)
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
		const startIndex = generatedSlots.indexOf(startSlot)
		const endIndex = generatedSlots.indexOf(endSlot)
		if (startIndex < 0 || endIndex < 0) return

		const min = Math.min(startIndex, endIndex)
		const max = Math.max(startIndex, endIndex)
		for (let index = min; index <= max; index += 1) {
			const slot = generatedSlots[index]
			if (!slot) continue
			setSlotSelection(slot, shouldSelect)
		}
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
		return new Set(
			getRectangularSlotSelection({
				slots: generatedSlots,
				startSlot,
				endSlot,
			}),
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
		if (!cancelled) {
			applyPendingPointerSelection()
		}
		clearPointerSelection()
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
		detachPointerSelectionListeners()
		clearPointerSelection()
	}

	if (handle.signal.aborted) {
		cleanupResources()
	} else {
		handle.signal.addEventListener('abort', cleanupResources)
	}

	function getSlotAvailability() {
		return Object.fromEntries(
			generatedSlots.map((slot) => [
				slot,
				{
					count: selectedSlots.has(slot) ? 1 : 0,
					availableNames: selectedSlots.has(slot)
						? [hostName.trim() || 'Host']
						: [],
				},
			]),
		)
	}

	async function createScheduleRequest() {
		const normalizedHostName = hostName.trim()
		if (!normalizedHostName) {
			setMessage('error', 'Host name is required.')
			return
		}

		if (selectedSlots.size === 0) {
			setMessage(
				'error',
				'Select at least one slot before creating a schedule link.',
			)
			return
		}

		status = 'saving'
		message = 'Creating link...'
		handle.update()

		try {
			const sortedSelectedSlots = Array.from(selectedSlots).sort(
				(left, right) => left.localeCompare(right),
			)
			const sortedBlockedSlots = generatedSlots
				.filter((slot) => !selectedSlots.has(slot))
				.sort((left, right) => left.localeCompare(right))
			const response = await fetch('/api/schedules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title,
					hostName: normalizedHostName,
					hostTimeZone: browserTimeZone,
					intervalMinutes,
					rangeStartUtc,
					rangeEndUtc,
					selectedSlots: sortedSelectedSlots,
					blockedSlots: sortedBlockedSlots,
				}),
			})
			const payload = (await response.json().catch(() => null)) as {
				ok?: boolean
				shareToken?: string
				hostAccessToken?: string
				error?: string
			} | null
			if (
				!response.ok ||
				!payload?.ok ||
				typeof payload.shareToken !== 'string' ||
				typeof payload.hostAccessToken !== 'string'
			) {
				const errorMessage =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to create schedule.'
				setMessage('error', errorMessage)
				return
			}
			const normalizedHostToken = payload.hostAccessToken.trim()
			if (!normalizedHostToken) {
				setMessage('error', 'Unable to create schedule.')
				return
			}
			const redirectTo = `/s/${encodeURIComponent(payload.shareToken)}/${encodeURIComponent(normalizedHostToken)}`
			navigate(redirectTo)
		} catch {
			setMessage('error', 'Network error while creating schedule.')
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		void createScheduleRequest()
	}

	function onCellPointerDown(slot: string, event: PointerEvent) {
		const nextMode = resolveTapRangeModeFromPointer({
			currentMode: useTapRangeMode,
			pointerType: event.pointerType,
		})
		if (nextMode !== useTapRangeMode) {
			useTapRangeMode = nextMode
			rangeAnchor = null
			tapRangeAction = null
			if (isTapRangeStartMessage(message)) {
				setMessage('idle', null)
			} else {
				handle.update()
			}
		}
		if (useTapRangeMode) return
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

	function onCellPointerEnter(slot: string) {
		updatePointerSelectionToSlot(slot)
	}

	function onCellPointerUp() {
		finishPointerSelection(false)
	}

	function onCellClick(slot: string) {
		if (!useTapRangeMode) return

		if (!rangeAnchor) {
			rangeAnchor = slot
			tapRangeAction = selectedSlots.has(slot) ? 'remove' : 'add'
			activeSlot = slot
			setMessage('idle', getTapRangeStartMessage(tapRangeAction))
			return
		}

		const shouldSelect = (tapRangeAction ?? 'add') === 'add'
		applyRange(rangeAnchor, slot, shouldSelect)
		rangeAnchor = null
		tapRangeAction = null
		activeSlot = slot
		setMessage('idle', null)
	}

	function onCellFocus(slot: string) {
		activeSlot = slot
		handle.update()
	}

	syncSlots()

	return () => {
		const slotAvailability = getSlotAvailability()
		const selectedCount = selectedSlots.size
		const isSaving = status === 'saving'

		return (
			<section
				css={{
					display: 'grid',
					gap: spacing.lg,
				}}
			>
				<header
					css={{
						display: 'grid',
						gap: spacing.md,
						padding: spacing.lg,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						background:
							'linear-gradient(140deg, color-mix(in srgb, var(--color-primary) 22%, var(--color-surface)), color-mix(in srgb, var(--color-primary) 8%, var(--color-background)))',
						boxShadow: shadows.sm,
					}}
				>
					<img
						src="/epic-scheduler-logo.svg"
						alt="Epic Scheduler"
						css={{
							width: 'min(100%, 28rem)',
							height: 'auto',
						}}
					/>
					<h1
						css={{
							margin: 0,
							fontSize: typography.fontSize.xl,
							fontWeight: typography.fontWeight.semibold,
							color: colors.text,
						}}
					>
						Plan once, share once, schedule faster.
					</h1>
					<p
						css={{
							margin: 0,
							color: colors.textMuted,
							maxWidth: '54ch',
						}}
					>
						Create one link, paint your own windows, and instantly see overlap
						without signup friction or message ping-pong.
					</p>
					<div
						css={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: spacing.xs,
						}}
					>
						<span
							css={{
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radius.full,
								backgroundColor: colors.primarySoft,
								color: colors.primaryText,
								fontSize: typography.fontSize.xs,
								fontWeight: typography.fontWeight.medium,
							}}
						>
							Realtime shared grid
						</span>
						<span
							css={{
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radius.full,
								backgroundColor: colors.primarySoft,
								color: colors.primaryText,
								fontSize: typography.fontSize.xs,
								fontWeight: typography.fontWeight.medium,
							}}
						>
							15/30/60 minute slots
						</span>
						<span
							css={{
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radius.full,
								backgroundColor: colors.primarySoft,
								color: colors.primaryText,
								fontSize: typography.fontSize.xs,
								fontWeight: typography.fontWeight.medium,
							}}
						>
							Timezone-friendly links
						</span>
					</div>
				</header>

				<form
					on={{ submit: handleSubmit }}
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
								css={{
									fontSize: typography.fontSize.sm,
									fontWeight: typography.fontWeight.medium,
									color: colors.text,
								}}
							>
								Schedule title
							</span>
							<input
								type="text"
								name="title"
								value={title}
								placeholder="Planning session"
								on={{
									input: (event) => {
										title = event.currentTarget.value
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
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span
								css={{
									fontSize: typography.fontSize.sm,
									fontWeight: typography.fontWeight.medium,
									color: colors.text,
								}}
							>
								Your name
							</span>
							<input
								type="text"
								name="hostName"
								value={hostName}
								placeholder="Your name"
								on={{
									input: (event) => {
										hostName = event.currentTarget.value
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
					</div>

					<div
						css={{
							display: 'grid',
							gap: spacing.md,
							gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
							[mq.mobile]: {
								gridTemplateColumns: '1fr',
							},
						}}
					>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span
								css={{ fontSize: typography.fontSize.sm, color: colors.text }}
							>
								Slot interval
							</span>
							<select
								name="interval"
								value={String(intervalMinutes)}
								on={{
									change: (event) => {
										const value = Number.parseInt(event.currentTarget.value, 10)
										updateDateRange({ intervalMinutes: value })
									},
								}}
								css={{
									padding: `${spacing.sm} ${spacing.md}`,
									borderRadius: radius.md,
									border: `1px solid ${colors.border}`,
									backgroundColor: colors.background,
									color: colors.text,
								}}
							>
								<option value="15">15 minutes</option>
								<option value="30">30 minutes</option>
								<option value="60">1 hour</option>
							</select>
						</label>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span
								css={{ fontSize: typography.fontSize.sm, color: colors.text }}
							>
								Start date
							</span>
							<input
								type="date"
								name="startDate"
								value={startDateInput}
								on={{
									change: (event) =>
										updateDateRange({
											startDateInput: event.currentTarget.value,
										}),
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
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span
								css={{ fontSize: typography.fontSize.sm, color: colors.text }}
							>
								End date
							</span>
							<input
								type="date"
								name="endDate"
								value={endDateInput}
								on={{
									change: (event) =>
										updateDateRange({
											endDateInput: event.currentTarget.value,
										}),
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
					</div>

					<div
						css={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: spacing.sm,
							alignItems: 'center',
						}}
					>
						<p css={{ margin: 0, color: colors.textMuted }}>
							{selectedCount} selected slot{selectedCount === 1 ? '' : 's'}
						</p>
						<p css={{ margin: 0, color: colors.textMuted }}>
							Times are shown in your browser timezone: {browserTimeZone}
						</p>
						{pointerSelectionMode ? (
							<p css={{ margin: 0, color: colors.textMuted }}>
								Selecting {pointerSelectionSlots.size} slot
								{pointerSelectionSlots.size === 1 ? '' : 's'} — release to apply
								or press Escape to cancel.
							</p>
						) : null}
					</div>

					{renderScheduleGrid({
						slots: generatedSlots,
						selectedSlots,
						selectionSlots: pointerSelectionSlots,
						selectionSlotLabel: 'included in pending drag selection',
						mobileDayKey,
						slotAvailability,
						maxAvailabilityCount: 1,
						activeSlot,
						rangeAnchor,
						onMobileDayChange: (dayKey) => {
							mobileDayKey = dayKey
							handle.update()
						},
						onCellPointerDown,
						onCellPointerEnter: (slot, _event) => {
							onCellPointerEnter(slot)
						},
						onCellPointerUp: (_slot, _event) => {
							onCellPointerUp()
						},
						onCellClick: (slot, _event) => {
							if (!useTapRangeMode) return
							onCellClick(slot)
						},
						onCellFocus,
					})}

					<div
						css={{
							display: 'flex',
							gap: spacing.sm,
							flexWrap: 'wrap',
							alignItems: 'center',
						}}
					>
						<button
							type="submit"
							disabled={isSaving}
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
							{isSaving ? 'Creating…' : 'Create share link'}
						</button>
						<button
							type="button"
							css={{
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radius.full,
								border: `1px solid ${colors.border}`,
								backgroundColor: 'transparent',
								color: colors.text,
								fontWeight: typography.fontWeight.medium,
								cursor: 'pointer',
							}}
							on={{
								click: () => {
									clearPointerSelection()
									detachPointerSelectionListeners()
									selectedSlots = buildDefaultSelection(generatedSlots)
									setMessage('idle', null)
								},
							}}
						>
							Reset to weekday work hours
						</button>
					</div>

					{message ? (
						<p
							role={status === 'error' ? 'alert' : undefined}
							css={{
								margin: 0,
								color: status === 'error' ? colors.error : colors.textMuted,
								fontSize: typography.fontSize.sm,
							}}
						>
							{message}
						</p>
					) : null}
				</form>
			</section>
		)
	}
}
