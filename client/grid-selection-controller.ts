import {
	createPointerDragSelectionController,
	type PointerDragSelectionControllerParams,
} from '#client/pointer-drag-selection.ts'
import { getRectangularSlotSelection } from '#client/schedule-utils.ts'

type CreateRectangularGridSelectionControllerParams = Omit<
	PointerDragSelectionControllerParams,
	'getSelectionSlots'
> & {
	getAllSlots: () => Array<string> | null
	includeSlot?: (slot: string) => boolean
}

export function applyBooleanSelectionToSet(params: {
	selection: Set<string>
	slots: ReadonlySet<string>
	shouldSelect: boolean
}) {
	let changed = false
	for (const slot of params.slots) {
		const wasSelected = params.selection.has(slot)
		if (wasSelected === params.shouldSelect) continue
		if (params.shouldSelect) {
			params.selection.add(slot)
		} else {
			params.selection.delete(slot)
		}
		changed = true
	}
	return changed
}

export function createRectangularGridSelectionController(
	params: CreateRectangularGridSelectionControllerParams,
) {
	return createPointerDragSelectionController({
		requestRender: params.requestRender,
		getSelectionSlots: (startSlot, endSlot) => {
			const allSlots = params.getAllSlots()
			if (!allSlots) return new Set<string>()
			const selectedSlots = getRectangularSlotSelection({
				slots: allSlots,
				startSlot,
				endSlot,
			})
			return new Set(
				params.includeSlot
					? selectedSlots.filter((slot) => params.includeSlot?.(slot))
					: selectedSlots,
			)
		},
		applySelection: params.applySelection,
		canUpdateSelection: params.canUpdateSelection,
		onSelectionPreviewSlot: params.onSelectionPreviewSlot,
		onSelectionFinished: params.onSelectionFinished,
	})
}
