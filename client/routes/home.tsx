import { type Handle } from 'remix/component'
import { getBrowserTimeZone } from '#client/browser-time-zone.ts'
import { navigate } from '#client/client-router.tsx'
import { renderScheduleGrid } from '#client/components/schedule-grid.tsx'
import { setDocumentTitle } from '#client/document-title.ts'
import {
	applyBooleanSelectionToSet,
	createRectangularGridSelectionController,
} from '#client/grid-selection-controller.ts'
import {
	addDays,
	createSlotRangeFromDateInputs,
	formatDateInputValue,
	getRectangularSlotSelection,
	remapSelectedSlotsForIntervalChange,
} from '#client/schedule-utils.ts'
import {
	clearHomeCreateFormFromSessionStorage,
	gridSelectionStorageKeyHome,
	readHomeCreateFormFromSessionStorage,
	readSlotIdsFromSessionStorage,
	filterSlotsToValidSet,
	writeHomeCreateFormToSessionStorage,
} from '#client/schedule-grid-selection-storage.ts'
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
	let keyboardRangeAnchor: string | null = null
	let keyboardRangeAction: 'add' | 'remove' | null = null
	let keyboardRangeSlots = new Set<string>()
	let keyboardCommittedRangeAnchor: string | null = null
	let keyboardCommittedRangeSlots = new Set<string>()
	let activeSlot: string | null = null
	let lastPointerWasTouch = false
	let status: RequestStatus = 'idle'
	let message: string | null = null
	let didInitializeSelection = false
	let scheduleTitleError: string | null = null
	let hostNameError: string | null = null
	let pendingHomeSelectionIds: Array<string> | null = null
	const scheduleTitleRequiredMessage =
		'Schedule name is required before making a submission.'
	const hostNameRequiredMessage =
		'Host name is required before making a submission.'

	function persistHomeForm() {
		writeHomeCreateFormToSessionStorage({
			title,
			hostName,
			intervalMinutes,
			startDateInput,
			endDateInput,
			selectedSlotIds: Array.from(selectedSlots),
		})
	}

	function tryRestoreHomeFormFromSession() {
		const data = readHomeCreateFormFromSessionStorage()
		if (!data) return
		title = data.title
		hostName = data.hostName
		intervalMinutes = data.intervalMinutes
		if (data.startDateInput && data.endDateInput) {
			startDateInput = data.startDateInput
			endDateInput = data.endDateInput
		}
		pendingHomeSelectionIds = data.selectedSlotIds
	}

	function syncSlots(previousIntervalMinutes = intervalMinutes) {
		const nextRange = createSlotRangeFromDateInputs({
			startDateInput,
			endDateInput,
			intervalMinutes,
		})
		rangeStartUtc = nextRange.rangeStartUtc
		rangeEndUtc = nextRange.rangeEndUtc
		generatedSlots = nextRange.slots

		if (!didInitializeSelection) {
			const valid = new Set(generatedSlots)
			if (pendingHomeSelectionIds !== null) {
				const restored = filterSlotsToValidSet(pendingHomeSelectionIds, valid)
				pendingHomeSelectionIds = null
				selectedSlots = restored
				didInitializeSelection = true
				persistHomeForm()
				return
			}
			const legacyStored = readSlotIdsFromSessionStorage(
				gridSelectionStorageKeyHome({
					rangeStartUtc,
					rangeEndUtc,
					intervalMinutes,
				}),
			)
			if (legacyStored && legacyStored.length > 0) {
				const restored = filterSlotsToValidSet(legacyStored, valid)
				if (restored.size > 0) {
					selectedSlots = restored
					didInitializeSelection = true
					persistHomeForm()
					return
				}
			}
			selectedSlots = buildDefaultSelection(generatedSlots)
			didInitializeSelection = true
			persistHomeForm()
			return
		}

		selectedSlots = remapSelectedSlotsForIntervalChange({
			previousSelectedSlots: selectedSlots,
			previousIntervalMinutes,
			nextSlots: generatedSlots,
			nextIntervalMinutes: intervalMinutes,
		})
		const validSlots = new Set(generatedSlots)
		if (keyboardRangeAnchor && !validSlots.has(keyboardRangeAnchor)) {
			keyboardRangeAnchor = null
			keyboardRangeAction = null
			keyboardRangeSlots = new Set<string>()
		} else if (keyboardRangeSlots.size > 0) {
			keyboardRangeSlots = remapSelectedSlotsForIntervalChange({
				previousSelectedSlots: keyboardRangeSlots,
				previousIntervalMinutes,
				nextSlots: generatedSlots,
				nextIntervalMinutes: intervalMinutes,
			})
			if (keyboardRangeSlots.size === 0) {
				keyboardRangeAnchor = null
				keyboardRangeAction = null
			}
		}
		if (
			keyboardCommittedRangeAnchor &&
			!validSlots.has(keyboardCommittedRangeAnchor)
		) {
			keyboardCommittedRangeAnchor = null
			keyboardCommittedRangeSlots = new Set<string>()
		} else if (keyboardCommittedRangeSlots.size > 0) {
			keyboardCommittedRangeSlots = remapSelectedSlotsForIntervalChange({
				previousSelectedSlots: keyboardCommittedRangeSlots,
				previousIntervalMinutes,
				nextSlots: generatedSlots,
				nextIntervalMinutes: intervalMinutes,
			})
			if (keyboardCommittedRangeSlots.size === 0) {
				keyboardCommittedRangeAnchor = null
			}
		}
		if (activeSlot && !validSlots.has(activeSlot)) {
			activeSlot = null
		}
		persistHomeForm()
	}

	function setMessage(nextStatus: RequestStatus, text: string | null) {
		status = nextStatus
		message = text
		handle.update()
	}

	function focusScheduleTitleInput() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return
		window.setTimeout(() => {
			const titleInput = document.querySelector<HTMLInputElement>(
				'input[name="title"]',
			)
			titleInput?.focus()
		}, 0)
	}

	function focusHostNameInput() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return
		window.setTimeout(() => {
			const nameInput = document.querySelector<HTMLInputElement>(
				'input[name="hostName"]',
			)
			nameInput?.focus()
		}, 0)
	}

	function validateRequiredSubmissionFields() {
		const normalizedTitle = title.trim()
		if (!normalizedTitle) {
			scheduleTitleError = scheduleTitleRequiredMessage
			hostNameError = null
			focusScheduleTitleInput()
			handle.update()
			return null
		}
		const normalizedHostName = hostName.trim()
		if (!normalizedHostName) {
			scheduleTitleError = null
			hostNameError = hostNameRequiredMessage
			focusHostNameInput()
			handle.update()
			return null
		}
		if (scheduleTitleError || hostNameError) {
			scheduleTitleError = null
			hostNameError = null
		}
		return {
			normalizedTitle,
			normalizedHostName,
		}
	}

	function updateDateRange(next: {
		startDateInput?: string
		endDateInput?: string
		intervalMinutes?: number
	}) {
		const previousIntervalMinutes = intervalMinutes
		if (next.startDateInput !== undefined) startDateInput = next.startDateInput
		if (next.endDateInput !== undefined) endDateInput = next.endDateInput
		if (next.intervalMinutes !== undefined)
			intervalMinutes = next.intervalMinutes
		try {
			syncSlots(previousIntervalMinutes)
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

	function clearCommittedKeyboardRange() {
		keyboardCommittedRangeAnchor = null
		keyboardCommittedRangeSlots = new Set<string>()
	}

	function clearKeyboardRangeSelection() {
		keyboardRangeAnchor = null
		keyboardRangeAction = null
		keyboardRangeSlots = new Set<string>()
	}

	function clearAllKeyboardRangeState() {
		clearKeyboardRangeSelection()
		clearCommittedKeyboardRange()
	}

	function updateKeyboardRangePreview(params: {
		fromSlot: string
		toSlot: string
		shiftKey: boolean
	}) {
		if (!params.shiftKey) {
			if (
				keyboardRangeAnchor ||
				keyboardRangeSlots.size > 0 ||
				keyboardCommittedRangeSlots.size > 0
			) {
				clearAllKeyboardRangeState()
				handle.update()
			}
			return
		}
		if (!generatedSlots.includes(params.fromSlot)) return
		if (!generatedSlots.includes(params.toSlot)) return
		if (!keyboardRangeAnchor) {
			clearCommittedKeyboardRange()
			keyboardRangeAnchor = params.fromSlot
			keyboardRangeAction = selectedSlots.has(params.fromSlot)
				? 'remove'
				: 'add'
		}
		if (!keyboardRangeAnchor) return
		keyboardRangeSlots = new Set(
			getRectangularSlotSelection({
				slots: generatedSlots,
				startSlot: keyboardRangeAnchor,
				endSlot: params.toSlot,
			}),
		)
		activeSlot = params.toSlot
		handle.update()
	}

	function applyKeyboardRangeSelection() {
		if (!keyboardRangeAnchor || !keyboardRangeAction) return false
		if (keyboardRangeSlots.size === 0) return false
		const shouldSelect = keyboardRangeAction === 'add'
		for (const slot of keyboardRangeSlots) {
			setSlotSelection(slot, shouldSelect)
		}
		keyboardCommittedRangeSlots = new Set(keyboardRangeSlots)
		keyboardCommittedRangeAnchor = keyboardRangeAnchor
		clearKeyboardRangeSelection()
		setMessage('idle', null)
		persistHomeForm()
		return true
	}

	function applyCommittedKeyboardRangeActivate(slot: string) {
		if (keyboardCommittedRangeSlots.size === 0) return false
		if (keyboardRangeSlots.size > 0) return false
		if (!keyboardCommittedRangeSlots.has(slot)) return false
		for (const rangeSlot of keyboardCommittedRangeSlots) {
			setSlotSelection(rangeSlot, !selectedSlots.has(rangeSlot))
		}
		activeSlot = slot
		setMessage('idle', null)
		persistHomeForm()
		handle.update()
		return true
	}

	function toggleSlotSelection(slot: string) {
		const shouldSelect = !selectedSlots.has(slot)
		setSlotSelection(slot, shouldSelect)
		activeSlot = slot
		clearAllKeyboardRangeState()
		setMessage('idle', null)
		persistHomeForm()
	}

	const pointerSelection = createRectangularGridSelectionController({
		requestRender: () => {
			handle.update()
		},
		getAllSlots: () => generatedSlots,
		applySelection: ({ mode, slots }) => {
			return applyBooleanSelectionToSet({
				selection: selectedSlots,
				slots,
				shouldSelect: mode === 'add',
			})
		},
		onSelectionPreviewSlot: (slot) => {
			activeSlot = slot
		},
		onSelectionFinished: ({ changed, cancelled }) => {
			if (changed && !cancelled) {
				persistHomeForm()
			}
			return true
		},
	})

	function cleanupResources() {
		pointerSelection.cleanup()
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
		const requiredFields = validateRequiredSubmissionFields()
		if (!requiredFields) return
		const { normalizedTitle, normalizedHostName } = requiredFields

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
					title: normalizedTitle,
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
			clearHomeCreateFormFromSessionStorage()
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
		lastPointerWasTouch = event.pointerType === 'touch'
		clearAllKeyboardRangeState()
		if (event.pointerType === 'touch') return
		pointerSelection.startSelection({
			slot,
			event,
			mode: selectedSlots.has(slot) ? 'remove' : 'add',
		})
	}

	function onCellDragHandlePointerDown(slot: string, event: PointerEvent) {
		lastPointerWasTouch = event.pointerType === 'touch'
		clearAllKeyboardRangeState()
		pointerSelection.startSelection({
			slot,
			event,
			mode: selectedSlots.has(slot) ? 'add' : 'remove',
		})
	}

	function onCellPointerEnter(slot: string) {
		pointerSelection.updateSelectionToSlot(slot)
	}

	function onCellPointerUp() {
		pointerSelection.finishSelection(false)
	}

	function onCellClick(slot: string, event: MouseEvent) {
		if (event.detail === 0) return
		if (!lastPointerWasTouch) return
		toggleSlotSelection(slot)
	}

	function onCellKeyboardActivate(slot: string) {
		if (applyKeyboardRangeSelection()) return
		if (applyCommittedKeyboardRangeActivate(slot)) return
		toggleSlotSelection(slot)
	}

	function onCellFocus(slot: string) {
		activeSlot = slot
		handle.update()
	}

	tryRestoreHomeFormFromSession()
	syncSlots()
	const secondaryTextColor =
		'color-mix(in srgb, var(--color-text) 82%, var(--color-surface))'
	const heroBadgeBackground =
		'color-mix(in srgb, var(--color-primary) 26%, var(--color-surface))'
	const heroBadgeBorder =
		'1px solid color-mix(in srgb, var(--color-primary) 38%, var(--color-border))'
	const pillBadgeCss = {
		padding: `${spacing.xs} ${spacing.sm}`,
		borderRadius: radius.full,
		backgroundColor: heroBadgeBackground,
		border: heroBadgeBorder,
		color: colors.text,
		fontSize: typography.fontSize.xs,
		fontWeight: typography.fontWeight.medium,
	}
	const aiReadyPillCss = {
		...pillBadgeCss,
		display: 'inline-flex',
		alignItems: 'center',
		textDecoration: 'none',
		cursor: 'pointer',
		'&:hover': {
			textDecoration: 'underline',
		},
		'&:focus-visible': {
			outline: `2px solid ${colors.primary}`,
			outlineOffset: '2px',
		},
	}

	return () => {
		setDocumentTitle('Epic Scheduler | Link-based meeting scheduler')
		const slotAvailability = getSlotAvailability()
		const selectedCount = selectedSlots.size
		const isSaving = status === 'saving'
		const isPointerRangePending = pointerSelection.state.mode !== null
		const pendingSelectionSlots = isPointerRangePending
			? pointerSelection.state.slots
			: keyboardRangeSlots.size > 0
				? keyboardRangeSlots
				: keyboardCommittedRangeSlots
		const pendingSelectionLabel = isPointerRangePending
			? 'included in pending drag selection'
			: keyboardRangeSlots.size > 0
				? 'included in pending keyboard range selection'
				: 'included in keyboard range selection'
		const gridRangeAnchor = keyboardRangeAnchor ?? keyboardCommittedRangeAnchor

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
					<div
						css={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: spacing.md,
							flexWrap: 'wrap',
						}}
					>
						<img
							src="/epic-scheduler-favicon.svg"
							alt=""
							aria-hidden="true"
							css={{
								width: '3.2rem',
								height: '3.2rem',
								borderRadius: radius.md,
							}}
						/>
						<div css={{ display: 'grid', gap: spacing.xs }}>
							<p
								css={{
									margin: 0,
									fontSize: typography.fontSize.xl,
									fontWeight: typography.fontWeight.semibold,
									color: colors.text,
									lineHeight: 1.05,
								}}
							>
								Epic Scheduler
							</p>
							<p
								css={{
									margin: 0,
									color: secondaryTextColor,
								}}
							>
								Fast overlap, fewer messages.
							</p>
						</div>
					</div>
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
							color: secondaryTextColor,
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
						<span css={pillBadgeCss}>Realtime shared grid</span>
						<span css={pillBadgeCss}>15/30/60 minute slots</span>
						<span css={pillBadgeCss}>Timezone-friendly links</span>
						<a href="/about-mcp" css={aiReadyPillCss} data-router-reload>
							AI Ready
						</a>
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
						[mq.mobile]: {
							// Full-bleed within the padded app shell so the scheduler form
							// matches the viewport width on small screens.
							width: '100vw',
							maxWidth: '100vw',
							marginInline: 'calc(50% - 50vw)',
							borderRadius: 0,
							borderInline: 'none',
							boxShadow: 'none',
						},
					}}
				>
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
								<option value="15" selected={intervalMinutes === 15}>
									15 minutes
								</option>
								<option value="30" selected={intervalMinutes === 30}>
									30 minutes
								</option>
								<option value="60" selected={intervalMinutes === 60}>
									1 hour
								</option>
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
						<p
							role="status"
							aria-live="polite"
							css={{ margin: 0, color: secondaryTextColor }}
						>
							{selectedCount} selected slot{selectedCount === 1 ? '' : 's'}
						</p>
						<p css={{ margin: 0, color: secondaryTextColor }}>
							Times are shown in your browser timezone: {browserTimeZone}
						</p>
					</div>

					{renderScheduleGrid({
						slots: generatedSlots,
						selectedSlots,
						selectionSlots: pendingSelectionSlots,
						selectionSlotLabel: pendingSelectionLabel,
						slotAvailability,
						maxAvailabilityCount: 1,
						activeSlot,
						rangeAnchor: gridRangeAnchor,
						onCellPointerDown,
						onCellDragHandlePointerDown: onCellDragHandlePointerDown,
						onCellPointerEnter: (slot, _event) => {
							onCellPointerEnter(slot)
						},
						onCellPointerUp: (_slot, _event) => {
							onCellPointerUp()
						},
						onCellClick: (slot, event) => {
							onCellClick(slot, event)
						},
						onCellKeyboardActivate: onCellKeyboardActivate,
						onCellKeyboardNavigate: ({ fromSlot, toSlot, shiftKey }) => {
							updateKeyboardRangePreview({ fromSlot, toSlot, shiftKey })
						},
						onCellFocus,
					})}

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
								aria-invalid={scheduleTitleError ? 'true' : undefined}
								aria-describedby={
									scheduleTitleError ? 'schedule-title-error' : undefined
								}
								on={{
									input: (event) => {
										title = event.currentTarget.value
										if (title.trim()) {
											scheduleTitleError = null
										}
										persistHomeForm()
										handle.update()
									},
								}}
								css={{
									padding: `${spacing.sm} ${spacing.md}`,
									borderRadius: radius.md,
									border: `1px solid ${scheduleTitleError ? colors.error : colors.border}`,
									backgroundColor: colors.background,
									color: colors.text,
									'&::placeholder': {
										color: secondaryTextColor,
										opacity: 1,
									},
								}}
							/>
							<p
								id="schedule-title-error"
								role={scheduleTitleError ? 'alert' : undefined}
								aria-live="polite"
								aria-hidden={scheduleTitleError ? undefined : 'true'}
								css={{
									margin: 0,
									minHeight: '1.25rem',
									color: colors.error,
									fontSize: typography.fontSize.xs,
								}}
							>
								{scheduleTitleError ?? ''}
							</p>
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
								aria-invalid={hostNameError ? 'true' : undefined}
								aria-describedby={hostNameError ? 'host-name-error' : undefined}
								on={{
									input: (event) => {
										hostName = event.currentTarget.value
										if (hostName.trim()) {
											hostNameError = null
										}
										persistHomeForm()
										handle.update()
									},
								}}
								css={{
									padding: `${spacing.sm} ${spacing.md}`,
									borderRadius: radius.md,
									border: `1px solid ${hostNameError ? colors.error : colors.border}`,
									backgroundColor: colors.background,
									color: colors.text,
									'&::placeholder': {
										color: secondaryTextColor,
										opacity: 1,
									},
								}}
							/>
							<p
								id="host-name-error"
								role={hostNameError ? 'alert' : undefined}
								aria-live="polite"
								aria-hidden={hostNameError ? undefined : 'true'}
								css={{
									margin: 0,
									minHeight: '1.25rem',
									color: colors.error,
									fontSize: typography.fontSize.xs,
								}}
							>
								{hostNameError ?? ''}
							</p>
						</label>
					</div>

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
									pointerSelection.cleanup()
									selectedSlots = buildDefaultSelection(generatedSlots)
									persistHomeForm()
									clearAllKeyboardRangeState()
									setMessage('idle', null)
								},
							}}
						>
							Reset to weekday work hours
						</button>
					</div>

					{message ? (
						<p
							role={status === 'error' ? 'alert' : 'status'}
							aria-live="polite"
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
