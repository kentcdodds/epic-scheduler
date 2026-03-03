import { buildGridModel } from '#client/schedule-utils.ts'

export type ScheduleGridSlotAvailability = {
	count: number
	availableNames: Array<string>
}

const scheduleGridSlotDateFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
})

export function formatScheduleGridSlotLabel(slot: string) {
	return scheduleGridSlotDateFormatter.format(new Date(slot))
}

export function buildScheduleGridTableModel(params: {
	slots: Array<string>
	disabledSlots?: ReadonlySet<string>
	hideDisabledOnlyRowsAndColumns?: boolean
}) {
	const grid = buildGridModel(params.slots)
	const {
		dayKeys: allDayKeys,
		dayLabels,
		timeKeys: allTimeKeys,
		timeLabels,
		cellByDayAndTime,
	} = grid
	const collapseDisabledAxes =
		!!params.hideDisabledOnlyRowsAndColumns &&
		(params.disabledSlots?.size ?? 0) > 0
	const dayKeys = collapseDisabledAxes
		? allDayKeys.filter((dayKey) =>
				allTimeKeys.some((timeKey) => {
					const slot = cellByDayAndTime[dayKey]?.[timeKey]
					if (!slot) return false
					return !(params.disabledSlots?.has(slot) ?? false)
				}),
			)
		: allDayKeys
	const timeKeys = collapseDisabledAxes
		? allTimeKeys.filter((timeKey) =>
				dayKeys.some((dayKey) => {
					const slot = cellByDayAndTime[dayKey]?.[timeKey]
					if (!slot) return false
					return !(params.disabledSlots?.has(slot) ?? false)
				}),
			)
		: allTimeKeys
	const missingSlotCellCount = dayKeys.reduce((total, dayKey) => {
		const dayCells = cellByDayAndTime[dayKey]
		if (!dayCells) return total + timeKeys.length
		let dayMissingCount = 0
		for (const timeKey of timeKeys) {
			if (!dayCells[timeKey]) {
				dayMissingCount += 1
			}
		}
		return total + dayMissingCount
	}, 0)
	return {
		dayKeys,
		dayLabels,
		timeKeys,
		timeLabels,
		cellByDayAndTime,
		missingSlotCellCount,
	}
}
