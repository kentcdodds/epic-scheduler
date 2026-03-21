import {
	colors,
	mq,
	radius,
	spacing,
	typography,
} from '#client/styles/tokens.ts'
import { visuallyHiddenCss } from '#client/styles/visually-hidden.ts'
import { getScheduleCellBackgroundColor } from '#client/schedule-grid-colors.ts'
import {
	buildScheduleGridTableModel,
	type ScheduleGridSlotAvailability,
} from '#client/schedule-grid-model.ts'
import {
	formatSlotLabel,
	parseDateInputToLocalDate,
} from '#client/schedule-utils.ts'

const gridNavigationKeys = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Home',
	'End',
	'PageUp',
	'PageDown',
])

type ScheduleGridProps = {
	slots: Array<string>
	selectedSlots: ReadonlySet<string>
	disabledSlots?: ReadonlySet<string>
	hideDisabledOnlyRowsAndColumns?: boolean
	highlightedSlots?: ReadonlySet<string>
	highlightedSlotLabel?: string
	selectionSlots?: ReadonlySet<string>
	selectionSlotLabel?: string
	selectedSlotLabel?: string
	unselectedSlotLabel?: string
	selectedBackground?: string
	pending?: boolean
	slotAvailability: Record<string, ScheduleGridSlotAvailability>
	maxAvailabilityCount: number
	activeSlot: string | null
	rangeAnchor: string | null
	readOnly?: boolean
	onCellPointerDown?: (slot: string, event: PointerEvent) => void
	onCellPointerEnter?: (slot: string, event: PointerEvent) => void
	onCellPointerMove?: (slot: string, event: PointerEvent) => void
	onCellPointerUp?: (slot: string, event: PointerEvent) => void
	onCellClick?: (slot: string, event: MouseEvent) => void
	onCellDragHandlePointerDown?: (slot: string, event: PointerEvent) => void
	onCellKeyboardActivate?: (slot: string) => void
	onCellFocus?: (slot: string) => void
	onCellHover?: (slot: string | null) => void
	onCellKeyboardNavigate?: (params: {
		fromSlot: string
		toSlot: string
		key: string
		shiftKey: boolean
	}) => void
	dayHeaderLayout?: 'single-line' | 'stacked'
	dayColumnWidth?: 'default' | 'narrow'
	showWeekSeparators?: boolean
	outlinedSlots?: ReadonlySet<string>
	outlinedSlotLabel?: string
	accentedSlots?: ReadonlySet<string>
	accentedSlotLabel?: string
	fitToContentWidth?: boolean
}

function toSelectionLabel(params: {
	selected: boolean
	selectedSlotLabel?: string
	unselectedSlotLabel?: string
}) {
	if (params.selected) {
		return params.selectedSlotLabel ?? 'selected for your availability'
	}
	return params.unselectedSlotLabel ?? 'not selected for your availability'
}

function getCellBackground(params: {
	count: number
	maxCount: number
	isSelected: boolean
	isDisabled: boolean
	isHighlighted: boolean
	selectedBackground?: string
}) {
	if (params.isDisabled) {
		return 'color-mix(in srgb, var(--color-background) 86%, var(--color-surface))'
	}
	if (params.isSelected && params.selectedBackground) {
		return params.selectedBackground
	}
	if (params.isHighlighted) {
		return `color-mix(in srgb, ${colors.success} 46%, var(--color-surface))`
	}
	return getScheduleCellBackgroundColor({
		count: params.count,
		maxCount: params.maxCount,
		isSelected: params.isSelected,
	})
}

const dayHeaderMonthDayFormatter = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	day: 'numeric',
})
const dayHeaderWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: 'short',
})

function formatStackedDayHeader(dayKey: string, fallbackLabel: string) {
	const date = parseDateInputToLocalDate(dayKey)
	if (!date) {
		return {
			monthDay: fallbackLabel,
			weekday: '',
		}
	}
	return {
		monthDay: dayHeaderMonthDayFormatter.format(date),
		weekday: dayHeaderWeekdayFormatter.format(date),
	}
}

function renderSingleLineDayHeader(label: string) {
	const commaIndex = label.indexOf(', ')
	if (commaIndex < 0) return label
	const firstLine = label.slice(0, commaIndex + 1)
	const secondLine = label.slice(commaIndex + 2)
	return (
		<span
			css={{
				display: 'inline-flex',
				flexWrap: 'wrap',
				justifyContent: 'center',
				columnGap: '0.25ch',
				rowGap: 0,
				maxWidth: '100%',
				lineHeight: 1.15,
			}}
		>
			<span css={{ whiteSpace: 'nowrap' }}>{firstLine}</span>
			<span css={{ whiteSpace: 'nowrap' }}>{secondLine}</span>
		</span>
	)
}

function isStartOfWeek(dayKey: string) {
	const date = parseDateInputToLocalDate(dayKey)
	if (!date) return false
	return date.getDay() === 0
}

function getRowCells(row: HTMLTableRowElement) {
	return Array.from(row.querySelectorAll('td'))
}

function getCellButton(cell: HTMLTableCellElement) {
	const button = cell.querySelector('button[data-slot]')
	return button instanceof HTMLButtonElement ? button : null
}

function moveFocusWithinGridCellButtons(params: {
	key: string
	currentButton: HTMLButtonElement
}) {
	const currentCell = params.currentButton.closest('td')
	const currentRow = currentCell?.parentElement
	const tableBody = currentRow?.parentElement
	if (!(currentCell instanceof HTMLTableCellElement)) return null
	if (!(currentRow instanceof HTMLTableRowElement)) return null
	if (!(tableBody instanceof HTMLTableSectionElement)) return null
	if (tableBody.tagName.toLowerCase() !== 'tbody') return null

	const rows = Array.from(tableBody.querySelectorAll('tr'))
	const rowIndex = rows.indexOf(currentRow)
	if (rowIndex < 0) return null

	const rowCells = getRowCells(currentRow)
	const columnIndex = rowCells.indexOf(currentCell)
	if (columnIndex < 0) return null

	function focusButton(button: HTMLButtonElement) {
		button.focus()
		return button
	}

	function focusCellAt(row: HTMLTableRowElement, col: number) {
		const cell = getRowCells(row)[col]
		if (!cell) return null
		const button = getCellButton(cell)
		if (!button) return null
		return focusButton(button)
	}

	function focusInRow(startIndex: number, step: 1 | -1) {
		let nextIndex = startIndex + step
		while (nextIndex >= 0 && nextIndex < rowCells.length) {
			const cell = rowCells[nextIndex]
			if (cell) {
				const button = getCellButton(cell)
				if (button) return focusButton(button)
			}
			nextIndex += step
		}
		return null
	}

	function focusInColumn(startIndex: number, step: 1 | -1) {
		let nextIndex = startIndex + step
		while (nextIndex >= 0 && nextIndex < rows.length) {
			const row = rows[nextIndex]
			if (row) {
				const button = focusCellAt(row, columnIndex)
				if (button) return button
			}
			nextIndex += step
		}
		return null
	}

	if (params.key === 'ArrowLeft') return focusInRow(columnIndex, -1)
	if (params.key === 'ArrowRight') return focusInRow(columnIndex, 1)
	if (params.key === 'ArrowUp') return focusInColumn(rowIndex, -1)
	if (params.key === 'ArrowDown') return focusInColumn(rowIndex, 1)
	if (params.key === 'PageUp') {
		for (let nextIndex = 0; nextIndex < rowIndex; nextIndex += 1) {
			const row = rows[nextIndex]
			if (row) {
				const button = focusCellAt(row, columnIndex)
				if (button) return button
			}
		}
		return null
	}
	if (params.key === 'PageDown') {
		for (
			let nextIndex = rows.length - 1;
			nextIndex > rowIndex;
			nextIndex -= 1
		) {
			const row = rows[nextIndex]
			if (row) {
				const button = focusCellAt(row, columnIndex)
				if (button) return button
			}
		}
		return null
	}
	if (params.key === 'Home') {
		for (const cell of rowCells) {
			const button = getCellButton(cell)
			if (!button) continue
			return focusButton(button)
		}
		return null
	}
	if (params.key === 'End') {
		for (let index = rowCells.length - 1; index >= 0; index -= 1) {
			const cell = rowCells[index]
			if (!cell) continue
			const button = getCellButton(cell)
			if (!button) continue
			return focusButton(button)
		}
		return null
	}
	return null
}

export function renderScheduleGrid(props: ScheduleGridProps) {
	const grid = buildScheduleGridTableModel({
		slots: props.slots,
		disabledSlots: props.disabledSlots,
		hideDisabledOnlyRowsAndColumns: props.hideDisabledOnlyRowsAndColumns,
	})
	const {
		dayKeys,
		dayLabels,
		timeKeys,
		timeLabels,
		cellByDayAndTime,
		missingSlotCellCount,
	} = grid
	const hasMissingSlots = missingSlotCellCount > 0
	const useStackedDayHeader = props.dayHeaderLayout === 'stacked'
	const useNarrowDayColumns = props.dayColumnWidth === 'narrow'
	const cellSizeScale = 2 / 3
	const dayColumnWidthRem = (useNarrowDayColumns ? 6.2 : 8) * cellSizeScale
	const timeColumnWidthRem = useNarrowDayColumns ? 4.4 : 4.8
	const mobileTimeColumnWidthRem = 4.8
	const cellHeightRem = 2.25 * cellSizeScale
	const cellHeightMobileRem = 2.65 * cellSizeScale
	const dragHandleOverflowRem = 0.75 * cellSizeScale
	const weekSeparatorWidth = props.showWeekSeparators ? '0.35rem' : '0'

	function shouldClearHoverOnPointerLeave(event: PointerEvent) {
		const currentTarget = event.currentTarget
		const relatedTarget = event.relatedTarget
		if (!(currentTarget instanceof Element)) return true
		if (!(relatedTarget instanceof Element)) return true
		const currentScroller = currentTarget.closest(
			'[data-schedule-grid-scroller]',
		)
		if (!currentScroller) return true
		const relatedSlotButton =
			relatedTarget.closest('button[data-slot]') ??
			relatedTarget.closest('td')?.querySelector('button[data-slot]')
		if (!relatedSlotButton) return true
		const relatedScroller = relatedSlotButton.closest(
			'[data-schedule-grid-scroller]',
		)
		if (!relatedScroller) return true
		return currentScroller !== relatedScroller
	}

	function renderGridTable(visibleDayKeys: Array<string>) {
		const fitToContent = !!props.fitToContentWidth
		const shouldReserveDragHandleSpace =
			!!props.onCellDragHandlePointerDown && !props.readOnly
		const desktopTableMinWidthRem =
			timeColumnWidthRem + visibleDayKeys.length * dayColumnWidthRem
		const mobileTableMinWidthRem =
			mobileTimeColumnWidthRem + visibleDayKeys.length * dayColumnWidthRem
		const keyboardRangeInstruction =
			!props.readOnly && props.onCellKeyboardNavigate
				? 'Hold Shift while moving to preview a range.'
				: null
		const keyboardActivateInstruction = props.onCellKeyboardActivate
			? props.readOnly
				? 'Press Enter or Space to focus slot details.'
				: 'Press Enter or Space to apply toggles.'
			: null
		const pointerInstruction = props.readOnly
			? null
			: 'On pointer devices, drag to select a range. On touch devices, tap a slot to toggle it, then drag the handle to apply that toggle across more slots.'
		const tableCaption = [
			props.readOnly ? 'Availability grid.' : 'Editable availability grid.',
			'Use arrow keys to move between time slots.',
			keyboardRangeInstruction,
			keyboardActivateInstruction,
			pointerInstruction,
		]
			.filter((value): value is string => !!value)
			.join(' ')

		function handleCellKeyDown(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const currentTarget = event.currentTarget
			if (!(currentTarget instanceof HTMLButtonElement)) return
			const slot = currentTarget.dataset.slot
			if (
				(event.key === 'Enter' ||
					event.key === ' ' ||
					event.key === 'Spacebar') &&
				slot &&
				props.onCellKeyboardActivate
			) {
				event.preventDefault()
				props.onCellKeyboardActivate(slot)
				return
			}
			if (!gridNavigationKeys.has(event.key)) return
			const fromSlot = currentTarget.dataset.slot
			const focusedButton = moveFocusWithinGridCellButtons({
				key: event.key,
				currentButton: currentTarget,
			})
			event.preventDefault()
			if (!focusedButton) return
			const toSlot = focusedButton.dataset.slot
			if (!fromSlot || !toSlot) return
			props.onCellKeyboardNavigate?.({
				fromSlot,
				toSlot,
				key: event.key,
				shiftKey: event.shiftKey,
			})
		}

		function syncHeaderBodyScroll(event: Event) {
			const currentTarget = event.currentTarget
			if (!(currentTarget instanceof HTMLElement)) return
			const shell = currentTarget.closest('[data-schedule-grid-shell]')
			if (!(shell instanceof HTMLElement)) return
			const headerScroll = shell.querySelector(
				'[data-schedule-grid-header-scroll]',
			)
			const bodyScroll = shell.querySelector('[data-schedule-grid-scroller]')
			if (!(headerScroll instanceof HTMLElement)) return
			if (!(bodyScroll instanceof HTMLElement)) return
			if (currentTarget === headerScroll) {
				bodyScroll.scrollLeft = headerScroll.scrollLeft
			} else {
				headerScroll.scrollLeft = bodyScroll.scrollLeft
			}
		}

		function renderDayHeaderContent(dayKey: string) {
			const stackedDayHeader = useStackedDayHeader
				? formatStackedDayHeader(dayKey, dayLabels[dayKey] ?? dayKey)
				: null
			return stackedDayHeader ? (
				<span
					css={{
						display: 'grid',
						justifyItems: 'center',
						gap: '0.1rem',
						lineHeight: 1.15,
					}}
				>
					<span>{stackedDayHeader.monthDay}</span>
					<span
						css={{
							fontSize: typography.fontSize.xs,
							color: colors.textMuted,
						}}
					>
						{stackedDayHeader.weekday}
					</span>
				</span>
			) : (
				renderSingleLineDayHeader(dayLabels[dayKey] ?? dayKey)
			)
		}

		// Two stacked tables share this colgroup; `table-layout: fixed` plus explicit
		// `<col>` widths keep header/body columns identical. `width: 100%` on both tables
		// previously let each scrollport lay out columns independently (and the header
		// scroller hides its scrollbar while the body shows one), which drifted columns.
		const sharedTableCss = {
			borderCollapse: 'separate' as const,
			borderSpacing: 0,
			tableLayout: 'fixed' as const,
			width: fitToContent
				? ('max-content' as const)
				: (`${desktopTableMinWidthRem}rem` as const),
			minWidth: fitToContent
				? `${desktopTableMinWidthRem}rem`
				: `${desktopTableMinWidthRem}rem`,
			maxWidth: fitToContent ? '100%' : undefined,
			[mq.mobile]: {
				width: `${mobileTableMinWidthRem}rem`,
				minWidth: `${mobileTableMinWidthRem}rem`,
				maxWidth: 'none',
			},
		}

		const columnGroup = (
			<colgroup>
				<col
					css={{
						width: `${timeColumnWidthRem}rem`,
						[mq.mobile]: {
							width: `${mobileTimeColumnWidthRem}rem`,
						},
					}}
				/>
				{visibleDayKeys.map((dayKey) => (
					<col
						key={`col:${dayKey}`}
						css={{
							width: `${dayColumnWidthRem}rem`,
						}}
					/>
				))}
			</colgroup>
		)

		return (
			<>
				<div
					css={{
						border: `1px solid ${colors.border}`,
						borderRadius: radius.lg,
						minWidth: 0,
						width: fitToContent ? 'fit-content' : undefined,
						maxWidth: fitToContent ? '100%' : undefined,
						marginInline: fitToContent ? 'auto' : undefined,
						backgroundColor: colors.surface,
						[mq.mobile]: {
							width: '100%',
							maxWidth: '100%',
							marginInline: 0,
							borderRadius: 0,
							borderInline: 'none',
							borderTop: 'none',
						},
					}}
				>
					<div
						css={{
							position: 'sticky',
							top: 0,
							zIndex: 7,
							backgroundColor: colors.surface,
							borderTopLeftRadius: radius.lg,
							borderTopRightRadius: radius.lg,
						}}
					>
						<div
							data-schedule-grid-header-scroll
							on={{
								scroll: syncHeaderBodyScroll,
							}}
							css={{
								overflowX: 'auto',
								overflowY: 'hidden',
								scrollbarGutter: 'stable',
								scrollbarWidth: 'none',
								msOverflowStyle: 'none',
								'&::-webkit-scrollbar': { display: 'none' },
							}}
						>
							<table css={sharedTableCss}>
								{columnGroup}
								<thead>
									<tr>
										<th
											scope="col"
											css={{
												position: 'sticky',
												left: 0,
												zIndex: 6,
												backgroundColor: colors.surface,
												padding: `${spacing.sm} ${spacing.sm}`,
												textAlign: 'left',
												fontSize: typography.fontSize.sm,
												color: colors.textMuted,
												borderBottom: `1px solid ${colors.border}`,
												borderRight: `1px solid ${colors.border}`,
												width: `${timeColumnWidthRem}rem`,
												minWidth: `${timeColumnWidthRem}rem`,
												maxWidth: `${timeColumnWidthRem}rem`,
												whiteSpace: 'nowrap',
												userSelect: 'none',
												[mq.mobile]: {
													minWidth: `${mobileTimeColumnWidthRem}rem`,
													maxWidth: `${mobileTimeColumnWidthRem}rem`,
													width: `${mobileTimeColumnWidthRem}rem`,
													paddingInline: spacing.xs,
												},
											}}
										>
											Time
										</th>
										{visibleDayKeys.map((dayKey, dayColumnIndex) => {
											const hasWeekSeparator =
												props.showWeekSeparators &&
												dayColumnIndex > 0 &&
												isStartOfWeek(dayKey)
											return (
												<th
													key={dayKey}
													scope="col"
													data-schedule-grid-day-header
													css={{
														zIndex: 5,
														backgroundColor: colors.surface,
														padding: useNarrowDayColumns
															? `${spacing.xs} ${spacing.xs}`
															: `${spacing.sm} ${spacing.sm}`,
														textAlign: 'center',
														fontSize: typography.fontSize.sm,
														color: colors.text,
														borderBottom: `1px solid ${colors.border}`,
														userSelect: 'none',
														width: `${dayColumnWidthRem}rem`,
														minWidth: `${dayColumnWidthRem}rem`,
														maxWidth: `${dayColumnWidthRem}rem`,
														borderLeft: hasWeekSeparator
															? `${weekSeparatorWidth} solid ${colors.surface}`
															: undefined,
													}}
												>
													{renderDayHeaderContent(dayKey)}
												</th>
											)
										})}
									</tr>
								</thead>
							</table>
						</div>
					</div>
					<div
						data-schedule-grid-scroller
						on={{
							pointerleave: props.onCellHover
								? () => props.onCellHover?.(null)
								: undefined,
							scroll: syncHeaderBodyScroll,
						}}
						css={{
							overflowX: 'auto',
							overflowY: 'hidden',
							scrollbarGutter: 'stable',
							borderBottomLeftRadius: radius.lg,
							borderBottomRightRadius: radius.lg,
							backgroundColor: colors.surface,
							[mq.mobile]: {
								overflowX: 'auto',
								overflowY: 'hidden',
								paddingBottom: shouldReserveDragHandleSpace
									? `${dragHandleOverflowRem}rem`
									: undefined,
								paddingRight: shouldReserveDragHandleSpace
									? `${dragHandleOverflowRem}rem`
									: undefined,
								WebkitOverflowScrolling: 'touch',
							},
						}}
					>
						<table css={sharedTableCss}>
							<caption css={visuallyHiddenCss}>{tableCaption}</caption>
							{columnGroup}
							<tbody>
								{timeKeys.map((timeKey) => (
									<tr key={timeKey}>
										<th
											scope="row"
											css={{
												position: 'sticky',
												left: 0,
												zIndex: 4,
												backgroundColor: colors.surface,
												padding: `0 ${spacing.sm}`,
												fontSize: typography.fontSize.xs,
												color: colors.textMuted,
												borderRight: `1px solid ${colors.border}`,
												borderBottom: `1px solid ${colors.border}`,
												textAlign: 'left',
												fontWeight: typography.fontWeight.medium,
												width: `${timeColumnWidthRem}rem`,
												minWidth: `${timeColumnWidthRem}rem`,
												maxWidth: `${timeColumnWidthRem}rem`,
												height: `${cellHeightRem}rem`,
												minHeight: `${cellHeightRem}rem`,
												whiteSpace: 'nowrap',
												userSelect: 'none',
												[mq.mobile]: {
													width: `${mobileTimeColumnWidthRem}rem`,
													minWidth: `${mobileTimeColumnWidthRem}rem`,
													maxWidth: `${mobileTimeColumnWidthRem}rem`,
													height: `${cellHeightMobileRem}rem`,
													minHeight: `${cellHeightMobileRem}rem`,
													paddingInline: spacing.xs,
												},
											}}
										>
											{timeLabels[timeKey]}
										</th>
										{visibleDayKeys.map((dayKey, dayColumnIndex) => {
											const slot = cellByDayAndTime[dayKey]?.[timeKey] ?? null
											const hasWeekSeparator =
												props.showWeekSeparators &&
												dayColumnIndex > 0 &&
												isStartOfWeek(dayKey)
											if (!slot) {
												const missingSlotExplanation = `No slot at ${timeLabels[timeKey]} on ${dayLabels[dayKey]}. This can happen around daylight-saving transitions or at schedule range boundaries.`
												return (
													<td
														key={`${dayKey}:${timeKey}:empty`}
														data-missing-slot-cell="true"
														title={missingSlotExplanation}
														css={{
															padding: 0,
															borderBottom: `1px solid ${colors.border}`,
															borderRight: `1px solid ${colors.border}`,
															borderLeft: hasWeekSeparator
																? `${weekSeparatorWidth} solid ${colors.surface}`
																: undefined,
															backgroundColor:
																'color-mix(in srgb, var(--color-background) 88%, var(--color-surface))',
															height: `${cellHeightRem}rem`,
															[mq.mobile]: {
																width: `${dayColumnWidthRem}rem`,
																minWidth: `${dayColumnWidthRem}rem`,
																maxWidth: `${dayColumnWidthRem}rem`,
																height: `${cellHeightMobileRem}rem`,
															},
														}}
													>
														<span
															aria-label={missingSlotExplanation}
															css={{
																display: 'grid',
																placeItems: 'center',
																minHeight: `${cellHeightRem}rem`,
																color: colors.textMuted,
																fontSize: typography.fontSize.xs,
																fontWeight: typography.fontWeight.medium,
																letterSpacing: '0.04em',
																userSelect: 'none',
																[mq.mobile]: {
																	minHeight: `${cellHeightMobileRem}rem`,
																},
															}}
														>
															N/A
														</span>
													</td>
												)
											}

											const availability = props.slotAvailability[slot] ?? {
												count: 0,
												availableNames: [],
											}
											const isSelected = props.selectedSlots.has(slot)
											const isDisabled = props.disabledSlots?.has(slot) ?? false
											const isHighlighted =
												props.highlightedSlots?.has(slot) ?? false
											const isPendingSelection =
												props.selectionSlots?.has(slot) ?? false
											const isOutlined = props.outlinedSlots?.has(slot) ?? false
											const isAccented = props.accentedSlots?.has(slot) ?? false
											const isRangeAnchor = props.rangeAnchor === slot
											const isActive = props.activeSlot === slot
											const background = getCellBackground({
												count: availability.count,
												maxCount: props.maxAvailabilityCount,
												isSelected,
												isDisabled,
												isHighlighted,
												selectedBackground: props.selectedBackground,
											})
											const slotLabel = formatSlotLabel(slot, 'long')
											const availabilitySelectionLabel = toSelectionLabel({
												selected: isSelected,
												selectedSlotLabel: props.selectedSlotLabel,
												unselectedSlotLabel: props.unselectedSlotLabel,
											})
											const attendeeLabel =
												availability.count > 0
													? `${availability.count} attendee${availability.count === 1 ? '' : 's'} available`
													: 'no attendees available'
											const attendeeNamesLabel =
												availability.availableNames.length === 0
													? ''
													: availability.availableNames.length <= 3
														? `, available attendees: ${availability.availableNames.join(', ')}`
														: `, available attendees include ${availability.availableNames
																.slice(0, 3)
																.join(', ')}, and ${
																availability.availableNames.length - 3
															} more`
											const highlightedLabel =
												isHighlighted && props.highlightedSlotLabel
													? `, ${props.highlightedSlotLabel}`
													: ''
											const pendingSelectionLabel =
												isPendingSelection && props.selectionSlotLabel
													? `, ${props.selectionSlotLabel}`
													: isPendingSelection
														? ', included in pending selection'
														: ''
											const disabledLabel = isDisabled
												? ', unavailable for scheduling'
												: ''
											const outlinedSelectionLabel =
												isOutlined && props.outlinedSlotLabel
													? `, ${props.outlinedSlotLabel}`
													: isOutlined
														? ', selected range'
														: ''
											const accentedSelectionLabel =
												isAccented && props.accentedSlotLabel
													? `, ${props.accentedSlotLabel}`
													: isAccented
														? ', highlighted for focused attendee'
														: ''
											const ariaLabel = `${slotLabel}, ${availabilitySelectionLabel}, ${attendeeLabel}${attendeeNamesLabel}${highlightedLabel}${pendingSelectionLabel}${outlinedSelectionLabel}${accentedSelectionLabel}${disabledLabel}`
											const interactive = !props.readOnly && !isDisabled
											const pendingSelectionOverlay = isPendingSelection
												? `inset 0 0 0 999px color-mix(in srgb, ${colors.primary} 14%, transparent)`
												: null
											const accentedSlotRing = isAccented
												? `inset 0 0 0 2px ${colors.success}`
												: null
											const outlinedSlotRing =
												isOutlined && !isAccented
													? `inset 0 0 0 2px ${colors.primary}`
													: null
											const activeSlotRing =
												isRangeAnchor || isActive
													? `inset 0 0 0 2px ${colors.primary}`
													: null
											const combinedBoxShadow = [
												pendingSelectionOverlay,
												accentedSlotRing,
												outlinedSlotRing,
												activeSlotRing,
											]
												.filter((value): value is string => !!value)
												.join(', ')
											const shouldShowDragHandle =
												!!props.onCellDragHandlePointerDown &&
												interactive &&
												isActive

											return (
												<td
													key={`${dayKey}:${timeKey}`}
													css={{
														padding: 0,
														height: `${cellHeightRem}rem`,
														borderBottom: `1px solid ${colors.border}`,
														borderRight: `1px solid ${colors.border}`,
														borderLeft: hasWeekSeparator
															? `${weekSeparatorWidth} solid ${colors.surface}`
															: undefined,
														...(shouldShowDragHandle
															? {
																	position: 'relative' as const,
																	zIndex: 3,
																	overflow: 'visible',
																}
															: {}),
														[mq.mobile]: {
															width: `${dayColumnWidthRem}rem`,
															minWidth: `${dayColumnWidthRem}rem`,
															maxWidth: `${dayColumnWidthRem}rem`,
															height: `${cellHeightMobileRem}rem`,
														},
													}}
												>
													<button
														type="button"
														data-slot={slot}
														aria-label={ariaLabel}
														aria-pressed={
															props.readOnly || isDisabled
																? undefined
																: isSelected
														}
														aria-disabled={isDisabled ? 'true' : undefined}
														title={`${slotLabel}\n${attendeeLabel}${isDisabled ? '\nUnavailable for scheduling' : ''}`}
														css={{
															display: 'grid',
															placeItems: 'center',
															position: 'relative',
															width: '100%',
															height: `${cellHeightRem}rem`,
															padding: spacing.xs,
															border: 'none',
															background,
															backgroundImage: isDisabled
																? 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-text) 11%, transparent) 0 5px, transparent 5px 10px)'
																: undefined,
															color: colors.text,
															cursor:
																props.readOnly || isDisabled
																	? 'default'
																	: 'pointer',
															userSelect: 'none',
															fontSize: typography.fontSize.xs,
															fontWeight: typography.fontWeight.medium,
															boxShadow: combinedBoxShadow || undefined,
															opacity: isDisabled ? 0.58 : 1,
															'&:focus-visible': {
																outline: `2px solid ${colors.primary}`,
																outlineOffset: '-2px',
															},
															[mq.mobile]: {
																height: `${cellHeightMobileRem}rem`,
																fontSize: typography.fontSize.sm,
															},
														}}
														on={{
															pointerdown:
																interactive && props.onCellPointerDown
																	? (event) =>
																			props.onCellPointerDown?.(slot, event)
																	: undefined,
															pointerenter:
																interactive &&
																(props.onCellPointerEnter || props.onCellHover)
																	? (event) => {
																			props.onCellPointerEnter?.(slot, event)
																			props.onCellHover?.(slot)
																		}
																	: props.onCellHover
																		? () => props.onCellHover?.(slot)
																		: undefined,
															pointermove: props.onCellPointerMove
																? (event) =>
																		props.onCellPointerMove?.(slot, event)
																: undefined,
															pointerleave: props.onCellHover
																? (event) => {
																		if (
																			!shouldClearHoverOnPointerLeave(event)
																		) {
																			return
																		}
																		props.onCellHover?.(null)
																	}
																: undefined,
															pointerup: props.onCellPointerUp
																? (event) =>
																		props.onCellPointerUp?.(slot, event)
																: undefined,
															click: props.onCellClick
																? (event) => props.onCellClick?.(slot, event)
																: undefined,
															focus: props.onCellFocus
																? () => props.onCellFocus?.(slot)
																: undefined,
															blur: props.onCellHover
																? () => props.onCellHover?.(null)
																: undefined,
															keydown: handleCellKeyDown,
														}}
													>
														<span css={{ position: 'relative', zIndex: 1 }}>
															{availability.count > 0 ? availability.count : ''}
														</span>
														{shouldShowDragHandle ? (
															<span
																aria-hidden="true"
																on={{
																	pointerdown: (event) => {
																		event.preventDefault()
																		event.stopPropagation()
																		props.onCellDragHandlePointerDown?.(
																			slot,
																			event,
																		)
																	},
																	click: (event) => {
																		event.preventDefault()
																		event.stopPropagation()
																	},
																}}
																css={{
																	position: 'absolute',
																	right: 0,
																	bottom: 0,
																	transform: 'translate(50%, 50%)',
																	width: `${1.5 * cellSizeScale}rem`,
																	height: `${1.5 * cellSizeScale}rem`,
																	display: 'grid',
																	placeItems: 'center',
																	zIndex: 2,
																	touchAction: 'none',
																	pointerEvents: 'auto',
																	cursor: 'nwse-resize',
																}}
															>
																<span
																	css={{
																		width: '0.5rem',
																		height: '0.5rem',
																		borderRadius: radius.full,
																		backgroundColor: colors.primary,
																		border: `2px solid ${colors.surface}`,
																		boxShadow:
																			'0 0 0 1px color-mix(in srgb, var(--color-primary) 65%, transparent)',
																		pointerEvents: 'none',
																	}}
																/>
															</span>
														) : null}
													</button>
												</td>
											)
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</>
		)
	}

	if (dayKeys.length === 0 || timeKeys.length === 0) {
		return (
			<p css={{ color: colors.textMuted, margin: 0 }}>
				No time slots available for this range.
			</p>
		)
	}

	return (
		<div
			data-schedule-grid-shell
			css={{
				display: 'grid',
				gap: spacing.sm,
				opacity: props.pending ? 0.6 : 1,
				transition: 'opacity 120ms ease',
				[mq.mobile]: {
					// Break out of padded ancestors so the grid aligns with the viewport;
					// inner scroll regions still scroll when the table is wider than the screen.
					width: '100vw',
					maxWidth: '100vw',
					marginInline: 'calc(50% - 50vw)',
				},
			}}
		>
			{hasMissingSlots ? (
				<p
					css={{
						margin: 0,
						color: colors.textMuted,
						fontSize: typography.fontSize.xs,
					}}
				>
					{missingSlotCellCount} cell{missingSlotCellCount === 1 ? '' : 's'}{' '}
					marked N/A because those local times have no slot in this schedule
					(for example daylight-saving transitions).
				</p>
			) : null}
			<div css={{ display: 'grid', minWidth: 0 }}>
				{renderGridTable(dayKeys)}
			</div>
		</div>
	)
}
