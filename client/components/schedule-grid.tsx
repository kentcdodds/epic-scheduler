import {
	breakpoints,
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
	pendingAddedSlots?: ReadonlySet<string>
	pendingRemovedSlots?: ReadonlySet<string>
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

function isMobileViewport() {
	if (typeof window === 'undefined') return false
	if (typeof window.matchMedia !== 'function') return false
	return window.matchMedia(`(max-width: ${breakpoints.mobile})`).matches
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
	const isMobile = isMobileViewport()
	const mobileDayIndex = resolvedMobileDayKey
		? dayKeys.indexOf(resolvedMobileDayKey)
		: -1
	const previousDayKey =
		mobileDayIndex > 0 ? (dayKeys[mobileDayIndex - 1] ?? null) : null
	const nextDayKey =
		mobileDayIndex >= 0 && mobileDayIndex < dayKeys.length - 1
			? (dayKeys[mobileDayIndex + 1] ?? null)
			: null
	const visibleDayKeys =
		isMobile && resolvedMobileDayKey ? [resolvedMobileDayKey] : dayKeys

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
				[mq.mobile]: {
					marginInline: 'calc(50% - 50vw)',
				},
			}}
		>
			{isMobile ? (
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
			) : null}
			<div
				css={{
					border: `1px solid ${colors.border}`,
					borderRadius: radius.lg,
					overflow: 'auto',
					backgroundColor: colors.surface,
					[mq.mobile]: {
						borderRadius: 0,
						borderInline: 'none',
						overflowX: 'hidden',
					},
				}}
			>
				<table
					css={{
						borderCollapse: 'separate',
						borderSpacing: 0,
						minWidth: isMobile
							? '100%'
							: `max(44rem, ${dayKeys.length * 8}rem)`,
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
									[mq.mobile]: {
										minWidth: '4.8rem',
										paddingInline: spacing.xs,
									},
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
													[mq.mobile]: {
														height: '2.65rem',
													},
												}}
											/>
										)
									}

									const availability = props.slotAvailability[slot] ?? {
										count: 0,
										availableNames: [],
									}
									const isSelected = props.selectedSlots.has(slot)
									const isPendingAdd =
										props.pendingAddedSlots?.has(slot) ?? false
									const isPendingRemove =
										props.pendingRemovedSlots?.has(slot) ?? false
									const pendingStateLabel = isPendingAdd
										? 'pending add'
										: isPendingRemove
											? 'pending removal'
											: ''
									const isRangeAnchor = props.rangeAnchor === slot
									const isActive = props.activeSlot === slot
									const background = getScheduleCellBackgroundColor({
										count: availability.count,
										maxCount: props.maxAvailabilityCount,
										isSelected,
									})
									const slotDate = new Date(slot)
									const slotLabel = slotDateFormatter.format(slotDate)
									const selectionLabel = isSelected
										? 'selected for your availability'
										: 'not selected for your availability'
									const attendeeLabel =
										availability.count > 0
											? `${availability.count} attendee${availability.count === 1 ? '' : 's'} available`
											: 'no attendees available'
									const ariaLabel = `${slotLabel}, ${selectionLabel}, ${attendeeLabel}${pendingStateLabel ? `, ${pendingStateLabel}` : ''}`

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
												aria-label={ariaLabel}
												aria-pressed={props.readOnly ? undefined : isSelected}
												title={`${slotLabel}\n${attendeeLabel}${pendingStateLabel ? `\n${pendingStateLabel}` : ''}`}
												css={{
													display: 'grid',
													placeItems: 'center',
													position: 'relative',
													width: '100%',
													minHeight: '2.25rem',
													padding: spacing.xs,
													border: 'none',
													background,
													backgroundImage: isPendingRemove
														? 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-error) 20%, transparent) 0 6px, transparent 6px 12px)'
														: undefined,
													color: colors.text,
													cursor: props.readOnly ? 'default' : 'pointer',
													fontSize: typography.fontSize.xs,
													fontWeight: typography.fontWeight.medium,
													boxShadow: isPendingAdd
														? `inset 0 0 0 2px ${colors.primary}`
														: undefined,
													outline:
														isRangeAnchor || isActive
															? `2px solid ${colors.primary}`
															: 'none',
													outlineOffset: '-2px',
													'&:focus-visible': {
														outline: `2px solid ${colors.primary}`,
														outlineOffset: '-2px',
													},
													[mq.mobile]: {
														minHeight: '2.65rem',
														fontSize: typography.fontSize.sm,
													},
												}}
												on={{
													pointerdown: props.onCellPointerDown
														? (event) => props.onCellPointerDown?.(slot, event)
														: undefined,
													pointerenter: props.onCellPointerEnter
														? (event) => props.onCellPointerEnter?.(slot, event)
														: undefined,
													pointerup: props.onCellPointerUp
														? (event) => props.onCellPointerUp?.(slot, event)
														: undefined,
													click: props.onCellClick
														? (event) => props.onCellClick?.(slot, event)
														: undefined,
													focus: props.onCellFocus
														? () => props.onCellFocus?.(slot)
														: undefined,
												}}
												disabled={props.readOnly}
											>
												{isPendingAdd || isPendingRemove ? (
													<span
														aria-hidden
														css={{
															position: 'absolute',
															top: '0.2rem',
															right: '0.2rem',
															display: 'inline-flex',
															minWidth: '0.9rem',
															height: '0.9rem',
															paddingInline: '0.2rem',
															alignItems: 'center',
															justifyContent: 'center',
															borderRadius: radius.full,
															backgroundColor: isPendingAdd
																? colors.primary
																: colors.error,
															color: colors.onPrimary,
															fontSize: '0.6rem',
															fontWeight: typography.fontWeight.bold,
															lineHeight: 1,
														}}
													>
														{isPendingAdd ? '+' : '−'}
													</span>
												) : null}
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
		</div>
	)
}
