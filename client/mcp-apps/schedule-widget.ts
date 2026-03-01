import { createWidgetHostBridge } from './widget-host-bridge.js'

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

function formatDateInput(date: Date) {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
	const next = new Date(date.getTime())
	next.setDate(next.getDate() + days)
	return next
}

function buildSlotsForWeekdays(params: {
	startDate: string
	endDate: string
	intervalMinutes: number
}) {
	if (
		!Number.isFinite(params.intervalMinutes) ||
		!Number.isInteger(params.intervalMinutes) ||
		params.intervalMinutes <= 0
	) {
		return []
	}

	const startParts = params.startDate
		.split('-')
		.map((value) => Number.parseInt(value, 10))
	const endParts = params.endDate
		.split('-')
		.map((value) => Number.parseInt(value, 10))
	const [startYear = 0, startMonth = 0, startDay = 0] = startParts
	const [endYear = 0, endMonth = 0, endDay = 0] = endParts

	if (
		!Number.isFinite(startYear) ||
		!Number.isFinite(startMonth) ||
		!Number.isFinite(startDay) ||
		!Number.isFinite(endYear) ||
		!Number.isFinite(endMonth) ||
		!Number.isFinite(endDay)
	) {
		return []
	}

	const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0)
	const end = addDays(new Date(endYear, endMonth - 1, endDay, 0, 0, 0, 0), 1)
	const startMs = start.getTime()
	const endMs = end.getTime()
	if (endMs <= startMs) {
		return []
	}
	const intervalMs = params.intervalMinutes * 60_000
	const estimatedSlots = Math.ceil((endMs - startMs) / intervalMs)
	if (estimatedSlots > 24 * 31 * 4) {
		return []
	}

	const slots: Array<string> = []
	for (let time = startMs; time < endMs; time += intervalMs) {
		const date = new Date(time)
		const weekday = date.getDay()
		const hour = date.getHours()
		if (weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 17) {
			slots.push(date.toISOString())
		}
	}
	return slots
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

function setupScheduleWidget() {
	const rootElement = document.querySelector('[data-schedule-widget]')
	if (!(rootElement instanceof HTMLElement)) return

	const appRoot = document.documentElement
	const outputElement = getFormElement<HTMLElement>(
		rootElement,
		'[data-output]',
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
	const submitTokenInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="submitToken"]',
	)
	const attendeeNameInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="attendeeName"]',
	)
	const submitSlotsInput = getFormElement<HTMLTextAreaElement>(
		rootElement,
		'textarea[name="submitSlots"]',
	)
	const snapshotTokenInput = getFormElement<HTMLInputElement>(
		rootElement,
		'input[name="snapshotToken"]',
	)

	const now = new Date()
	startDateInput.value = formatDateInput(now)
	endDateInput.value = formatDateInput(addDays(now, 6))

	function writeOutput(value: unknown) {
		outputElement.textContent =
			typeof value === 'string' ? value : JSON.stringify(value, null, 2)
	}

	const hostBridge = createWidgetHostBridge({
		appInfo: {
			name: 'schedule-widget',
			version: '1.0.0',
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
		}
	}

	async function createSchedule() {
		const selectedSlots = parseSlots(createSlotsInput.value)
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
				selectedSlots,
			}),
		})
		const payload = await response.json().catch(() => null)
		if (!response.ok) {
			throw new Error(
				typeof payload?.error === 'string'
					? payload.error
					: `Request failed (${response.status})`,
			)
		}
		const shareToken =
			typeof payload?.shareToken === 'string' ? payload.shareToken : ''
		if (shareToken) {
			submitTokenInput.value = shareToken
			snapshotTokenInput.value = shareToken
		}
		return payload
	}

	async function submitAvailability() {
		const token = submitTokenInput.value.trim()
		if (!token) {
			throw new Error('Share token is required.')
		}
		const selectedSlots = parseSlots(submitSlotsInput.value)
		const response = await fetch(`/api/schedules/${token}/availability`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: attendeeNameInput.value,
				selectedSlots,
			}),
		})
		const payload = await response.json().catch(() => null)
		if (!response.ok) {
			throw new Error(
				typeof payload?.error === 'string'
					? payload.error
					: `Request failed (${response.status})`,
			)
		}
		snapshotTokenInput.value = token
		return payload
	}

	async function fetchSnapshot() {
		const token = snapshotTokenInput.value.trim()
		if (!token) {
			throw new Error('Share token is required.')
		}
		const response = await fetch(`/api/schedules/${token}`)
		const payload = await response.json().catch(() => null)
		if (!response.ok) {
			throw new Error(
				typeof payload?.error === 'string'
					? payload.error
					: `Request failed (${response.status})`,
			)
		}
		return payload
	}

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
				hostMessage: 'Created an Epic Scheduler schedule via MCP app UI.',
			})
		})

	rootElement
		.querySelector('[data-action="submit"]')
		?.addEventListener('click', () => {
			void withOutput('Submitting availability', submitAvailability, {
				hostMessage: 'Submitted attendee availability via MCP app UI.',
			})
		})

	rootElement
		.querySelector('[data-action="fetch"]')
		?.addEventListener('click', () => {
			void withOutput('Loading snapshot', fetchSnapshot)
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
	writeOutput('Ready.')
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', setupScheduleWidget, {
		once: true,
	})
} else {
	setupScheduleWidget()
}
