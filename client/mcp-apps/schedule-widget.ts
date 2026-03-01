import { getScheduleCellBackgroundColor } from '#client/schedule-grid-colors.ts'
import { getSelectionDiff } from '#client/schedule-selection-utils.ts'
import {
	createSlotAvailability,
	getMaxAvailabilityCount,
} from '#client/schedule-snapshot-utils.ts'
import {
	addDays,
	buildGridModel,
	createSlotRangeFromDateInputs,
	findSelectionForAttendee,
	formatDateInputValue,
} from '#client/schedule-utils.ts'
import { type ScheduleSnapshot } from '#shared/schedule-store.ts'
import { createWidgetHostBridge } from './widget-host-bridge.js'

const slotDateFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
})

const attendeeLocalTimeFormatters = new Map<string, Intl.DateTimeFormat>()

function readTheme(source: Record<string, unknown> | undefined) {
	const value = source?.theme
	return value === 'dark' || value === 'light' ? value : undefined
}

function parseSlots(input: string) {
	return input
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
}

function isDisplayMode(
	value: unknown,
): value is 'inline' | 'fullscreen' | 'pip' {
	return value === 'inline' || value === 'fullscreen' || value === 'pip'
}

function readAvailableDisplayModes(
	source: Record<string, unknown> | undefined,
) {
	if (!Array.isArray(source?.availableDisplayModes)) {
		return [] as Array<'inline' | 'fullscreen' | 'pip'>
	}
	return source.availableDisplayModes.filter((mode) => isDisplayMode(mode))
}

function getBrowserTimeZone() {
	const value = Intl.DateTimeFormat().resolvedOptions().timeZone
	if (typeof value !== 'string') return 'UTC'
	const normalized = value.trim()
	return normalized || 'UTC'
}

function buildSlotsForWeekdays(params: {
	startDate: string
	endDate: string
	intervalMinutes: number
}) {
	try {
		const range = createSlotRangeFromDateInputs({
			startDateInput: params.startDate,
			endDateInput: params.endDate,
			intervalMinutes: params.intervalMinutes,
		})
		return range.slots.filter((slot) => {
			const date = new Date(slot)
			const weekday = date.getDay()
			const hour = date.getHours()
			return weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 17
		})
	} catch {
		return []
	}
}

function getFormElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
): T {
	const element = root.querySelector<T>(selector)
	if (!element) {
		throw new Error(`Missing widget element: ${selector}`)
	}
	return element
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

function formatSlotForAttendeeTimeZone(slot: string, timeZone: string | null) {
	if (!timeZone) {
		return {
			localTime: 'Local time unknown',
			timeZoneLabel: 'timezone unknown',
		}
	}
	const slotDate = new Date(slot)
	if (Number.isNaN(slotDate.getTime())) {
		return { localTime: 'Local time unknown', timeZoneLabel: timeZone }
	}
	try {
		let formatter = attendeeLocalTimeFormatters.get(timeZone)
		if (!formatter) {
			formatter = new Intl.DateTimeFormat(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				timeZone,
			})
			attendeeLocalTimeFormatters.set(timeZone, formatter)
		}
		return {
			localTime: formatter.format(slotDate),
			timeZoneLabel: timeZone,
		}
	} catch {
		return { localTime: 'Local time unknown', timeZoneLabel: timeZone }
	}
}

function setupScheduleWidget() {
	const rootElement = document.querySelector('[data-schedule-widget]')
	if (!(rootElement instanceof HTMLElement)) return

	const appRoot = document.documentElement
	const outputElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-output]',
	)
	const scheduleTitleElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-schedule-title]',
	)
	const shareTokenElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-share-token]',
	)
	const connectionLabelElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-connection-label]',
	)
	const statusElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-status]',
	)
	const gridHostElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-grid-host]',
	)
	const slotDetailsElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-slot-details]',
	)
	const selectedCountElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-selected-count]',
	)
	const pendingCountElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-pending-count]',
	)
	const browserTimeZoneElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-browser-timezone]',
	)

	const titleInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="title"]',
	)
	const hostNameInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="hostName"]',
	)
	const intervalSelect = getFormElement<HTMLSelectElement>(
		rootElement,
		'select[name="interval"]',
	)
	const startDateInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="startDate"]',
	)
	const endDateInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="endDate"]',
	)
	const createSlotsInput = getFormElement<HTMLTextAreaElement>(
		rootElement,
		'textarea[name="createSlots"]',
	)
	const snapshotTokenInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="snapshotToken"]',
	)
	const attendeeNameInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="attendeeName"]',
	)

	const now = new Date()
	startDateInput.value = formatDateInputValue(now)
	endDateInput.value = formatDateInputValue(addDays(now, 6))
	browserTimeZoneElement.textContent = getBrowserTimeZone()

	let snapshot: ScheduleSnapshot | null = null
	let selectedSlots = new Set<string>()
	let persistedSelectedSlots = new Set<string>()
	let activeSlot: string | null = null

	function writeOutput(value: unknown) {
		outputElement.textContent =
			typeof value === 'string' ? value : JSON.stringify(value, null, 2)
	}

	function setStatus(message: string, error = false) {
		statusElement.textContent = message
		statusElement.setAttribute('data-status-tone', error ? 'error' : 'normal')
	}

	function setConnectionLabel(message: string) {
		connectionLabelElement.textContent = message
	}

	function getPersistedSelectionForName(name: string) {
		if (!snapshot) return new Set<string>()
		return new Set(
			findSelectionForAttendee({
				attendeeName: name,
				attendees: snapshot.attendees,
				availabilityByAttendee: snapshot.availabilityByAttendee,
			}),
		)
	}

	function updateSelectionSummary() {
		const selectionDiff = getSelectionDiff({
			currentSelection: selectedSlots,
			persistedSelection: persistedSelectedSlots,
		})
		const pendingCount =
			selectionDiff.pendingAdded.size + selectionDiff.pendingRemoved.size
		selectedCountElement.textContent = String(selectedSlots.size)
		pendingCountElement.textContent = String(pendingCount)
	}

	function updateActiveSlotStyles() {
		for (const element of gridHostElement.querySelectorAll<HTMLButtonElement>(
			'button[data-slot]',
		)) {
			const slot = element.dataset.slot
			element.classList.toggle('is-active', slot === activeSlot)
		}
	}

	function renderSlotDetails() {
		if (!snapshot || !activeSlot) {
			slotDetailsElement.hidden = true
			slotDetailsElement.replaceChildren()
			return
		}

		const activeSlotValue = activeSlot
		const availableNames = snapshot.availableNamesBySlot[activeSlotValue] ?? []
		const availableNameSet = new Set(availableNames)
		const availableAttendees = snapshot.attendees.filter((entry) =>
			availableNameSet.has(entry.name),
		)
		const unavailableAttendees = snapshot.attendees.filter(
			(entry) => !availableNameSet.has(entry.name),
		)
		const selectionDiff = getSelectionDiff({
			currentSelection: selectedSlots,
			persistedSelection: persistedSelectedSlots,
		})
		const pendingStatus = selectionDiff.pendingAdded.has(activeSlotValue)
			? 'Pending add to your availability.'
			: selectionDiff.pendingRemoved.has(activeSlotValue)
				? 'Pending removal from your availability.'
				: ''

		const availableList =
			availableAttendees.length > 0
				? `<ul>${availableAttendees
						.map((entry) => {
							const slotTime = formatSlotForAttendeeTimeZone(
								activeSlotValue,
								entry.timeZone,
							)
							return `<li><strong>${escapeHtml(entry.name)}</strong> - ${escapeHtml(
								slotTime.localTime,
							)} (${escapeHtml(slotTime.timeZoneLabel)})</li>`
						})
						.join('')}</ul>`
				: '<p class="scheduler-muted">None</p>'
		const unavailableList =
			unavailableAttendees.length > 0
				? `<ul>${unavailableAttendees
						.map((entry) => {
							const slotTime = formatSlotForAttendeeTimeZone(
								activeSlotValue,
								entry.timeZone,
							)
							return `<li><strong>${escapeHtml(entry.name)}</strong> - ${escapeHtml(
								slotTime.localTime,
							)} (${escapeHtml(slotTime.timeZoneLabel)})</li>`
						})
						.join('')}</ul>`
				: '<p class="scheduler-muted">None</p>'
		const formattedSlot = slotDateFormatter.format(new Date(activeSlotValue))

		slotDetailsElement.hidden = false
		slotDetailsElement.innerHTML = `
			<h2>Slot details</h2>
			<p class="scheduler-muted">${escapeHtml(formattedSlot)}</p>
			<div class="scheduler-row">
				<p><strong>Available (${availableAttendees.length})</strong></p>
				${availableList}
			</div>
			<div class="scheduler-row">
				<p><strong>Unavailable (${unavailableAttendees.length})</strong></p>
				${unavailableList}
			</div>
			${pendingStatus ? `<p class="scheduler-muted">${escapeHtml(pendingStatus)}</p>` : ''}
		`
	}

	function renderGrid() {
		if (!snapshot) {
			gridHostElement.innerHTML = `
				<p class="scheduler-muted" style="padding: var(--spacing-md)">
					No schedule loaded yet.
				</p>
			`
			updateSelectionSummary()
			return
		}

		const selectionDiff = getSelectionDiff({
			currentSelection: selectedSlots,
			persistedSelection: persistedSelectedSlots,
		})
		const slotAvailability = createSlotAvailability(snapshot)
		const maxAvailabilityCount = getMaxAvailabilityCount(slotAvailability)
		const grid = buildGridModel(snapshot.slots)
		const { dayKeys, dayLabels, timeKeys, timeLabels, cellByDayAndTime } = grid
		if (dayKeys.length === 0 || timeKeys.length === 0) {
			gridHostElement.innerHTML = `
				<p class="scheduler-muted" style="padding: var(--spacing-md)">
					No time slots available for this schedule.
				</p>
			`
			updateSelectionSummary()
			return
		}

		const dayHeaders = dayKeys
			.map(
				(dayKey) =>
					`<th scope="col">${escapeHtml(dayLabels[dayKey] ?? dayKey)}</th>`,
			)
			.join('')

		const bodyRows = timeKeys
			.map((timeKey) => {
				const timeLabel = escapeHtml(timeLabels[timeKey] ?? timeKey)
				const cells = dayKeys
					.map((dayKey) => {
						const slot = cellByDayAndTime[dayKey]?.[timeKey] ?? null
						if (!slot) {
							return `<td class="scheduler-grid-empty"></td>`
						}

						const availability = slotAvailability[slot] ?? {
							count: 0,
							availableNames: [],
						}
						const isSelected = selectedSlots.has(slot)
						const isPendingAdd = selectionDiff.pendingAdded.has(slot)
						const isPendingRemove = selectionDiff.pendingRemoved.has(slot)
						const pendingLabel = isPendingAdd
							? 'pending add'
							: isPendingRemove
								? 'pending removal'
								: ''
						const background = getScheduleCellBackgroundColor({
							count: availability.count,
							maxCount: maxAvailabilityCount,
							isSelected,
						})
						const slotLabel = slotDateFormatter.format(new Date(slot))
						const attendeeLabel =
							availability.count > 0
								? `${availability.count} attendee${availability.count === 1 ? '' : 's'} available`
								: 'no attendees available'
						const selectionLabel = isSelected
							? 'selected for your availability'
							: 'not selected for your availability'
						const ariaLabel = `${slotLabel}, ${selectionLabel}, ${attendeeLabel}${pendingLabel ? `, ${pendingLabel}` : ''}`
						const title = `${slotLabel}\n${attendeeLabel}${pendingLabel ? `\n${pendingLabel}` : ''}`
						const classNames = [
							'scheduler-slot',
							isSelected ? 'is-selected' : '',
							activeSlot === slot ? 'is-active' : '',
							isPendingAdd ? 'is-pending-add' : '',
							isPendingRemove ? 'is-pending-remove' : '',
						]
							.filter((value) => value.length > 0)
							.join(' ')
						return `
							<td>
								<button
									type="button"
									class="${classNames}"
									style="background: ${background}"
									data-slot="${escapeHtml(slot)}"
									aria-label="${escapeHtml(ariaLabel)}"
									aria-pressed="${isSelected ? 'true' : 'false'}"
									title="${escapeHtml(title)}"
								>${availability.count > 0 ? String(availability.count) : ''}</button>
							</td>
						`
					})
					.join('')
				return `<tr><th scope="row">${timeLabel}</th>${cells}</tr>`
			})
			.join('')

		gridHostElement.innerHTML = `
			<table>
				<thead>
					<tr>
						<th scope="col">Time</th>
						${dayHeaders}
					</tr>
				</thead>
				<tbody>${bodyRows}</tbody>
			</table>
		`
		updateSelectionSummary()
	}

	function resetSelectionForAttendee() {
		persistedSelectedSlots = getPersistedSelectionForName(
			attendeeNameInput.value,
		)
		selectedSlots = new Set(persistedSelectedSlots)
		if (activeSlot && snapshot?.slots.includes(activeSlot)) {
			return
		}
		activeSlot = snapshot?.slots[0] ?? null
	}

	function setSnapshot(nextSnapshot: ScheduleSnapshot) {
		snapshot = nextSnapshot
		scheduleTitleElement.textContent =
			nextSnapshot.schedule.title || 'Schedule availability'
		shareTokenElement.textContent = nextSnapshot.schedule.shareToken
		snapshotTokenInput.value = nextSnapshot.schedule.shareToken
		setConnectionLabel('Snapshot loaded and ready.')
		if (!attendeeNameInput.value.trim()) {
			attendeeNameInput.value = nextSnapshot.attendees[0]?.name ?? ''
		}
		resetSelectionForAttendee()
		setStatus('Select slots, then save availability.')
		renderGrid()
		renderSlotDetails()
	}

	const hostBridge = createWidgetHostBridge({
		appInfo: {
			name: 'schedule-widget',
			version: '2.0.0',
		},
		onRenderData: (renderData) => {
			const theme = readTheme(renderData)
			if (theme) {
				appRoot.setAttribute('data-theme', theme)
			} else {
				appRoot.removeAttribute('data-theme')
			}
		},
		onHostContextChanged: (hostContext) => {
			const theme = readTheme(hostContext)
			if (theme) {
				appRoot.setAttribute('data-theme', theme)
			} else {
				appRoot.removeAttribute('data-theme')
			}
		},
	})

	async function requestFullscreenMode() {
		const availableModes = readAvailableDisplayModes(
			hostBridge.getHostContext(),
		)
		if (availableModes.length > 0 && !availableModes.includes('fullscreen')) {
			throw new Error(
				`Host does not advertise fullscreen mode support. Available modes: ${availableModes.join(', ')}`,
			)
		}
		const grantedMode = await hostBridge.requestDisplayMode('fullscreen')
		if (!grantedMode) {
			throw new Error('Host did not grant fullscreen mode request.')
		}
		return {
			ok: true,
			requestedMode: 'fullscreen',
			grantedMode,
		}
	}

	async function withOutput(
		label: string,
		fn: () => Promise<unknown>,
		options: { hostMessage?: string } = {},
	) {
		writeOutput(`${label}...`)
		try {
			const result = await fn()
			writeOutput(result)
			if (options.hostMessage) {
				void hostBridge.sendUserMessageWithFallback(options.hostMessage)
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unexpected widget failure.'
			writeOutput({ ok: false, error: message })
			setStatus(message, true)
		}
	}

	async function fetchSnapshot(tokenOverride?: string) {
		const token = (tokenOverride ?? snapshotTokenInput.value).trim()
		if (!token) {
			throw new Error('Share token is required.')
		}
		const response = await fetch(`/api/schedules/${token}`)
		const payload = (await response.json().catch(() => null)) as {
			ok?: boolean
			snapshot?: ScheduleSnapshot
			error?: string
		} | null
		if (!response.ok || !payload?.ok || !payload.snapshot) {
			throw new Error(
				typeof payload?.error === 'string'
					? payload.error
					: `Request failed (${response.status})`,
			)
		}
		setSnapshot(payload.snapshot)
		return payload
	}

	async function createSchedule() {
		const selectedCreateSlots = parseSlots(createSlotsInput.value)
		if (selectedCreateSlots.length === 0) {
			throw new Error(
				'Select at least one host slot before creating a schedule.',
			)
		}

		const response = await fetch('/api/schedules', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: titleInput.value,
				hostName: hostNameInput.value,
				intervalMinutes: Number.parseInt(intervalSelect.value, 10),
				rangeStartUtc: new Date(
					`${startDateInput.value}T00:00:00`,
				).toISOString(),
				rangeEndUtc: addDays(
					new Date(`${endDateInput.value}T00:00:00`),
					1,
				).toISOString(),
				hostTimeZone: getBrowserTimeZone(),
				selectedSlots: selectedCreateSlots,
			}),
		})
		const payload = (await response.json().catch(() => null)) as {
			ok?: boolean
			shareToken?: string
			error?: string
		} | null
		if (
			!response.ok ||
			!payload?.ok ||
			typeof payload.shareToken !== 'string'
		) {
			throw new Error(
				typeof payload?.error === 'string'
					? payload.error
					: `Request failed (${response.status})`,
			)
		}
		snapshotTokenInput.value = payload.shareToken
		if (!attendeeNameInput.value.trim()) {
			attendeeNameInput.value = hostNameInput.value.trim()
		}
		await fetchSnapshot(payload.shareToken)
		return payload
	}

	async function submitAvailability() {
		const token = snapshotTokenInput.value.trim()
		if (!token) {
			throw new Error('Share token is required.')
		}
		const attendeeName = attendeeNameInput.value.trim()
		if (!attendeeName) {
			throw new Error('Attendee name is required.')
		}

		const response = await fetch(`/api/schedules/${token}/availability`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: attendeeName,
				attendeeTimeZone: getBrowserTimeZone(),
				selectedSlots: Array.from(selectedSlots).sort((left, right) =>
					left.localeCompare(right),
				),
			}),
		})
		const payload = (await response.json().catch(() => null)) as {
			ok?: boolean
			snapshot?: ScheduleSnapshot
			error?: string
		} | null
		if (!response.ok || !payload?.ok) {
			throw new Error(
				typeof payload?.error === 'string'
					? payload.error
					: `Request failed (${response.status})`,
			)
		}
		if (payload.snapshot) {
			setSnapshot(payload.snapshot)
		} else {
			await fetchSnapshot(token)
		}
		return payload
	}

	attendeeNameInput.addEventListener('input', () => {
		if (!snapshot) return
		resetSelectionForAttendee()
		renderGrid()
		renderSlotDetails()
		setStatus('Loaded saved availability for this attendee.')
	})

	gridHostElement.addEventListener('click', (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const slotButton = target.closest<HTMLButtonElement>('button[data-slot]')
		if (!slotButton || !snapshot) return

		const slot = slotButton.dataset.slot
		if (!slot) return
		activeSlot = slot
		if (!attendeeNameInput.value.trim()) {
			setStatus('Enter your name before editing availability.', true)
			updateActiveSlotStyles()
			renderSlotDetails()
			return
		}

		if (selectedSlots.has(slot)) {
			selectedSlots.delete(slot)
		} else {
			selectedSlots.add(slot)
		}
		setStatus('Local changes pending. Save availability to sync.')
		renderGrid()
		renderSlotDetails()
	})

	gridHostElement.addEventListener('focusin', (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const slotButton = target.closest<HTMLButtonElement>('button[data-slot]')
		if (!slotButton) return
		const slot = slotButton.dataset.slot
		if (!slot) return
		activeSlot = slot
		updateActiveSlotStyles()
		renderSlotDetails()
	})

	rootElement
		.querySelector('[data-action="fill-demo-slots"]')
		?.addEventListener('click', () => {
			const intervalMinutes = Number.parseInt(intervalSelect.value, 10)
			const slots = buildSlotsForWeekdays({
				startDate: startDateInput.value,
				endDate: endDateInput.value,
				intervalMinutes,
			})
			createSlotsInput.value = slots.join('\n')
			setStatus('Filled host slots with weekday 9-5 defaults.')
		})

	rootElement
		.querySelector('[data-action="request-fullscreen"]')
		?.addEventListener('click', () => {
			void withOutput('Requesting fullscreen mode', requestFullscreenMode)
		})

	rootElement
		.querySelector('[data-action="create"]')
		?.addEventListener('click', () => {
			void withOutput('Creating schedule', createSchedule, {
				hostMessage:
					'Created and loaded an Epic Scheduler schedule in MCP app.',
			})
		})

	rootElement
		.querySelector('[data-action="submit"]')
		?.addEventListener('click', () => {
			void withOutput('Saving availability', submitAvailability, {
				hostMessage: 'Saved attendee availability from MCP app schedule grid.',
			})
		})

	rootElement
		.querySelector('[data-action="fetch"]')
		?.addEventListener('click', () => {
			void withOutput('Loading snapshot', () => fetchSnapshot())
		})

	const trustedHostOrigin = (() => {
		if (!document.referrer) return null
		try {
			return new URL(document.referrer).origin
		} catch {
			return null
		}
	})()

	window.addEventListener('message', (event) => {
		if (event.source !== window.parent) return
		if (trustedHostOrigin && event.origin !== trustedHostOrigin) return
		hostBridge.handleHostMessage(event.data)
	})

	void hostBridge.initialize()
	hostBridge.requestRenderData()
	updateSelectionSummary()
	writeOutput('Ready.')
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', setupScheduleWidget, {
		once: true,
	})
} else {
	setupScheduleWidget()
}
