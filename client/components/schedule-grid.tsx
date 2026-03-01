import { colors, radius, spacing, typography } from '#client/styles/tokens.ts'
import { buildGridModel } from '#client/schedule-utils.ts'

type SlotAvailability = {
	count: number
	availableNames: Array<string>
}

type ScheduleGridProps = {
	slots: Array<string>
	selectedSlots: ReadonlySet<string>
	slotAvailability: Record<string, SlotAvailability>
	maxAvailabilityCount: number
	activeSlot: string | null
	rangeAnchor: string | null
	readOnly?: boolean
	onCellPointerDown?: (slot: string, event: PointerEvent) => void
	onCellPointerEnter?: (slot: string, event: PointerEvent) => void
	onCellPointerUp?: (slot: string, event: PointerEvent) => void
	onCellClick?: (slot: string, event: MouseEvent) => void
	onCellFocus?: (slot: string) => void
}

function getHeatBackgroundColor(params: {
	count: number
	maxCount: number
	isSelected: boolean
}) {
	if (params.isSelected) {
		return 'color-mix(in srgb, var(--color-primary) 38%, var(--color-surface))'
	}
	if (params.count <= 0 || params.maxCount <= 0) {
		return 'color-mix(in srgb, var(--color-surface) 95%, var(--color-background))'
	}

	const normalized = Math.max(
		0,
		Math.min(1, params.count / Math.max(1, params.maxCount)),
	)
	const primaryMix = Math.round(10 + normalized * 40)
	return `color-mix(in srgb, var(--color-primary) ${primaryMix}%, var(--color-surface))`
}

export function renderScheduleGrid(props: ScheduleGridProps) {
	const grid = buildGridModel(props.slots)
	const { dayKeys, dayLabels, timeKeys, timeLabels, cellByDayAndTime } = grid

	if (dayKeys.length === 0 || timeKeys.length === 0) {
		return (
			<p css={{ color: colors.textMuted, margin: 0 }}>
				No time slots available for this range.
			</p>
		)
	}

	return (
		<div
			css={{
				border: `1px solid ${colors.border}`,
				borderRadius: radius.lg,
				overflow: 'auto',
				backgroundColor: colors.surface,
			}}
		>
			<table
				css={{
					borderCollapse: 'separate',
					borderSpacing: 0,
					minWidth: `max(44rem, ${dayKeys.length * 8}rem)`,
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
								minWidth: '5.5rem',
							}}
						>
							Time
						</th>
						{dayKeys.map((dayKey) => (
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
							{dayKeys.map((dayKey) => {
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
											}}
										/>
									)
								}

								const availability = props.slotAvailability[slot] ?? {
									count: 0,
									availableNames: [],
								}
								const isSelected = props.selectedSlots.has(slot)
								const isRangeAnchor = props.rangeAnchor === slot
								const isActive = props.activeSlot === slot
								const background = getHeatBackgroundColor({
									count: availability.count,
									maxCount: props.maxAvailabilityCount,
									isSelected,
								})
								const slotDate = new Date(slot)
								const slotLabel = new Intl.DateTimeFormat(undefined, {
									weekday: 'long',
									month: 'long',
									day: 'numeric',
									hour: 'numeric',
									minute: '2-digit',
								}).format(slotDate)
								const selectionLabel = isSelected
									? 'selected for your availability'
									: 'not selected for your availability'
								const attendeeLabel =
									availability.count > 0
										? `${availability.count} attendee${availability.count === 1 ? '' : 's'} available`
										: 'no attendees available'

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
											aria-label={`${slotLabel}, ${selectionLabel}, ${attendeeLabel}`}
											aria-pressed={props.readOnly ? undefined : isSelected}
											title={`${slotLabel}\n${attendeeLabel}`}
											css={{
												display: 'grid',
												placeItems: 'center',
												width: '100%',
												minHeight: '2.25rem',
												padding: spacing.xs,
												border: 'none',
												background,
												color: colors.text,
												cursor: props.readOnly ? 'default' : 'pointer',
												fontSize: typography.fontSize.xs,
												fontWeight: typography.fontWeight.medium,
												outline:
													isRangeAnchor || isActive
														? `2px solid ${colors.primary}`
														: 'none',
												outlineOffset: '-2px',
												'&:focus-visible': {
													outline: `2px solid ${colors.primary}`,
													outlineOffset: '-2px',
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
											{availability.count > 0 ? availability.count : ''}
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
