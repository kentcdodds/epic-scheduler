import {
	colors,
	mq,
	radius,
	spacing,
	typography,
} from '#client/styles/tokens.ts'
import { getScheduleCellBackgroundColor } from '#client/schedule-grid-colors.ts'
import { buildGridModel } from '#client/schedule-utils.ts'

type SlotAvailability = {
	count: number
	availableNames: Array<string>
}

const slotDateFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
})

type ScheduleGridProps = {
	slots: Array<string>
	selectedSlots: ReadonlySet<string>
	disabledSlots?: ReadonlySet<string>
	highlightedSlots?: ReadonlySet<string>
	highlightedSlotLabel?: string
	selectedSlotLabel?: string
	unselectedSlotLabel?: string
	selectedBackground?: string
	pending?: boolean
	mobileDayKey?: string | null
	slotAvailability: Record<string, SlotAvailability>
	maxAvailabilityCount: number
	activeSlot: string | null
	rangeAnchor: string | null
	readOnly?: boolean
	onMobileDayChange?: (dayKey: string) => void
	onCellPointerDown?: (slot: string, event: PointerEvent) => void
	onCellPointerEnter?: (slot: string, event: PointerEvent) => void
	onCellPointerUp?: (slot: string, event: PointerEvent) => void
	onCellClick?: (slot: string, event: MouseEvent) => void
	onCellFocus?: (slot: string) => void
	onCellHover?: (slot: string | null) => void
}

function toDayKey(slot: string | null) {
	if (!slot) return null
	const date = new Date(slot)
	if (Number.isNaN(date.getTime())) return null
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
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
		return 'color-mix(in srgb, #22c55e 46%, var(--color-surface))'
	}
	return getScheduleCellBackgroundColor({
		count: params.count,
		maxCount: params.maxCount,
		isSelected: params.isSelected,
	})
}

export function renderScheduleGrid(props: ScheduleGridProps) {
	const grid = buildGridModel(props.slots)
	const { dayKeys, dayLabels, timeKeys, timeLabels, cellByDayAndTime } = grid
	const activeDayKey = toDayKey(props.activeSlot)
	const defaultMobileDayKey =
		activeDayKey && dayKeys.includes(activeDayKey)
			? activeDayKey
			: (dayKeys[0] ?? null)
	const resolvedMobileDayKey =
		props.mobileDayKey && dayKeys.includes(props.mobileDayKey)
			? props.mobileDayKey
			: defaultMobileDayKey
	const mobileDayIndex = resolvedMobileDayKey
		? dayKeys.indexOf(resolvedMobileDayKey)
		: -1
	const previousDayKey =
		mobileDayIndex > 0 ? (dayKeys[mobileDayIndex - 1] ?? null) : null
	const nextDayKey =
		mobileDayIndex >= 0 && mobileDayIndex < dayKeys.length - 1
			? (dayKeys[mobileDayIndex + 1] ?? null)
			: null
	const mobileVisibleDayKeys = resolvedMobileDayKey
		? [resolvedMobileDayKey]
		: dayKeys
	const desktopVisibleDayKeys = dayKeys

	function renderGridTable(visibleDayKeys: Array<string>, compact: boolean) {
		return (
			<div
				css={{
					border: `1px solid ${colors.border}`,
					borderRadius: radius.lg,
					overflow: 'auto',
					backgroundColor: colors.surface,
					[mq.mobile]: compact
						? {
								borderRadius: 0,
								borderInline: 'none',
								overflowX: 'hidden',
							}
						: {},
				}}
			>
				<table
					css={{
						borderCollapse: 'separate',
						borderSpacing: 0,
						minWidth: compact ? '100%' : `max(44rem, ${dayKeys.length * 8}rem)`,
						width: '100%',
					}}
				>
					<thead>
						<tr>
							<th
								scope="col"
								css={{
									position: 'sticky',
									left: 0,
									top: 0,
									zIndex: 3,
									backgroundColor: colors.surface,
									padding: `${spacing.sm} ${spacing.sm}`,
									textAlign: 'left',
									fontSize: typography.fontSize.sm,
									color: colors.textMuted,
									borderBottom: `1px solid ${colors.border}`,
									borderRight: `1px solid ${colors.border}`,
									minWidth: '5rem',
									[mq.mobile]: compact
										? {
												minWidth: '4.8rem',
												paddingInline: spacing.xs,
											}
										: {},
								}}
							>
								Time
							</th>
							{visibleDayKeys.map((dayKey) => (
								<th
									key={dayKey}
									scope="col"
									css={{
										position: 'sticky',
										top: 0,
										zIndex: 2,
										backgroundColor: colors.surface,
										padding: `${spacing.sm} ${spacing.sm}`,
										textAlign: 'center',
										fontSize: typography.fontSize.sm,
										color: colors.text,
										borderBottom: `1px solid ${colors.border}`,
									}}
								>
									{dayLabels[dayKey]}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{timeKeys.map((timeKey) => (
							<tr key={timeKey}>
								<th
									scope="row"
									css={{
										position: 'sticky',
										left: 0,
										zIndex: 1,
										backgroundColor: colors.surface,
										padding: `${spacing.xs} ${spacing.sm}`,
										fontSize: typography.fontSize.xs,
										color: colors.textMuted,
										borderRight: `1px solid ${colors.border}`,
										borderBottom: `1px solid ${colors.border}`,
										textAlign: 'left',
										fontWeight: typography.fontWeight.medium,
									}}
								>
									{timeLabels[timeKey]}
								</th>
								{visibleDayKeys.map((dayKey) => {
									const slot = cellByDayAndTime[dayKey]?.[timeKey] ?? null
									if (!slot) {
										return (
											<td
												key={`${dayKey}:${timeKey}:empty`}
												css={{
													borderBottom: `1px solid ${colors.border}`,
													backgroundColor:
														'color-mix(in srgb, var(--color-background) 88%, var(--color-surface))',
													height: '2.25rem',
													[mq.mobile]: compact
														? {
																height: '2.65rem',
															}
														: {},
												}}
											/>
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
									const slotDate = new Date(slot)
									const slotLabel = slotDateFormatter.format(slotDate)
									const selectionLabel = toSelectionLabel({
										selected: isSelected,
										selectedSlotLabel: props.selectedSlotLabel,
										unselectedSlotLabel: props.unselectedSlotLabel,
									})
									const attendeeLabel =
										availability.count > 0
											? `${availability.count} attendee${availability.count === 1 ? '' : 's'} available`
											: 'no attendees available'
									const highlightedLabel =
										isHighlighted && props.highlightedSlotLabel
											? `, ${props.highlightedSlotLabel}`
											: ''
									const disabledLabel = isDisabled
										? ', unavailable for scheduling'
										: ''
									const ariaLabel = `${slotLabel}, ${selectionLabel}, ${attendeeLabel}${highlightedLabel}${disabledLabel}`
									const interactive = !props.readOnly && !isDisabled

									return (
										<td
											key={`${dayKey}:${timeKey}`}
											css={{
												padding: 0,
												borderBottom: `1px solid ${colors.border}`,
												borderRight: `1px solid ${colors.border}`,
											}}
										>
											<button
												type="button"
												data-slot={slot}
												aria-label={ariaLabel}
												aria-pressed={
													props.readOnly || isDisabled ? undefined : isSelected
												}
												aria-disabled={isDisabled ? 'true' : undefined}
												title={`${slotLabel}\n${attendeeLabel}${isDisabled ? '\nUnavailable for scheduling' : ''}`}
												css={{
													display: 'grid',
													placeItems: 'center',
													position: 'relative',
													width: '100%',
													minHeight: '2.25rem',
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
													fontSize: typography.fontSize.xs,
													fontWeight: typography.fontWeight.medium,
													outline:
														isRangeAnchor || isActive
															? `2px solid ${colors.primary}`
															: 'none',
													outlineOffset: '-2px',
													opacity: isDisabled ? 0.58 : 1,
													'&:focus-visible': {
														outline: `2px solid ${colors.primary}`,
														outlineOffset: '-2px',
													},
													[mq.mobile]: compact
														? {
																minHeight: '2.65rem',
																fontSize: typography.fontSize.sm,
															}
														: {},
												}}
												on={{
													pointerdown:
														interactive && props.onCellPointerDown
															? (event) =>
																	props.onCellPointerDown?.(slot, event)
															: undefined,
													pointerenter:
														interactive && props.onCellPointerEnter
															? (event) =>
																	props.onCellPointerEnter?.(slot, event)
															: props.onCellHover
																? () => props.onCellHover?.(slot)
																: undefined,
													pointerleave: props.onCellHover
														? () => props.onCellHover?.(null)
														: undefined,
													pointerup:
														interactive && props.onCellPointerUp
															? (event) => props.onCellPointerUp?.(slot, event)
															: undefined,
													click:
														interactive && props.onCellClick
															? (event) => props.onCellClick?.(slot, event)
															: undefined,
													focus: props.onCellFocus
														? () => props.onCellFocus?.(slot)
														: undefined,
													blur: props.onCellHover
														? () => props.onCellHover?.(null)
														: undefined,
												}}
											>
												<span css={{ position: 'relative', zIndex: 1 }}>
													{availability.count > 0 ? availability.count : ''}
												</span>
											</button>
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
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
					marginInline: 'calc(50% - 50vw)',
				},
			}}
		>
			<div
				css={{
					display: 'none',
					[mq.mobile]: {
						display: 'grid',
						gap: spacing.sm,
					},
				}}
			>
				<div
					role="status"
					aria-live="polite"
					css={{
						position: 'sticky',
						top: 0,
						zIndex: 6,
						display: 'grid',
						gridTemplateColumns: 'auto minmax(0, 1fr) auto',
						alignItems: 'center',
						gap: spacing.sm,
						padding: `${spacing.xs} ${spacing.md}`,
						border: `1px solid ${colors.border}`,
						borderRadius: radius.md,
						backgroundColor: colors.surface,
						boxShadow:
							'0 6px 18px color-mix(in srgb, var(--color-text) 10%, transparent)',
					}}
				>
					<button
						type="button"
						disabled={!previousDayKey}
						aria-label="Show previous day"
						on={{
							click: () => {
								if (!previousDayKey) return
								props.onMobileDayChange?.(previousDayKey)
							},
						}}
						css={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: '2rem',
							height: '2rem',
							borderRadius: radius.full,
							border: `1px solid ${colors.border}`,
							backgroundColor: previousDayKey
								? colors.surface
								: colors.background,
							color: previousDayKey ? colors.text : colors.textMuted,
							fontSize: typography.fontSize.base,
							fontWeight: typography.fontWeight.bold,
							cursor: previousDayKey ? 'pointer' : 'not-allowed',
						}}
					>
						{'<'}
					</button>
					<div css={{ minWidth: 0, textAlign: 'center' }}>
						<p
							css={{
								margin: 0,
								color: colors.text,
								fontWeight: typography.fontWeight.semibold,
								fontSize: typography.fontSize.sm,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{resolvedMobileDayKey ? dayLabels[resolvedMobileDayKey] : ''}
						</p>
						<p
							css={{
								margin: 0,
								color: colors.textMuted,
								fontSize: typography.fontSize.xs,
							}}
						>
							Day {Math.max(1, mobileDayIndex + 1)} of {dayKeys.length}
						</p>
					</div>
					<button
						type="button"
						disabled={!nextDayKey}
						aria-label="Show next day"
						on={{
							click: () => {
								if (!nextDayKey) return
								props.onMobileDayChange?.(nextDayKey)
							},
						}}
						css={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: '2rem',
							height: '2rem',
							borderRadius: radius.full,
							border: `1px solid ${colors.border}`,
							backgroundColor: nextDayKey ? colors.surface : colors.background,
							color: nextDayKey ? colors.text : colors.textMuted,
							fontSize: typography.fontSize.base,
							fontWeight: typography.fontWeight.bold,
							cursor: nextDayKey ? 'pointer' : 'not-allowed',
						}}
					>
						{'>'}
					</button>
				</div>
			</div>
			<div
				css={{
					display: 'grid',
					[mq.mobile]: {
						display: 'none',
					},
				}}
			>
				{renderGridTable(desktopVisibleDayKeys, false)}
			</div>
			<div
				css={{
					display: 'none',
					[mq.mobile]: {
						display: 'grid',
					},
				}}
			>
				{renderGridTable(mobileVisibleDayKeys, true)}
			</div>
		</div>
	)
}
