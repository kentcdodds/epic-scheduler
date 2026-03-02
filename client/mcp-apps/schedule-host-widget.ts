import { extractScheduleToolInput } from './schedule-widget-tool-input.js'
import { createWidgetHostBridge } from './widget-host-bridge.js'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function readTheme(source: Record<string, unknown> | undefined) {
	const value = source?.theme
	return value === 'dark' || value === 'light' ? value : undefined
}

function isDisplayMode(
	value: unknown,
): value is 'inline' | 'fullscreen' | 'pip' {
	return value === 'inline' || value === 'fullscreen' || value === 'pip'
}

function readDisplayMode(source: Record<string, unknown> | undefined) {
	const value = source?.displayMode
	return isDisplayMode(value) ? value : null
}

function readAvailableDisplayModes(
	source: Record<string, unknown> | undefined,
) {
	if (!Array.isArray(source?.availableDisplayModes)) {
		return [] as Array<'inline' | 'fullscreen' | 'pip'>
	}
	return source.availableDisplayModes.filter((mode) => isDisplayMode(mode))
}

function readNonEmptyString(value: unknown) {
	if (typeof value !== 'string') return null
	const normalized = value.trim()
	return normalized.length > 0 ? normalized : null
}

function getElement<T extends HTMLElement>(
	root: ParentNode,
	selector: string,
): T {
	const element = root.querySelector<T>(selector)
	if (!element) {
		throw new Error(`Missing host widget element: ${selector}`)
	}
	return element
}

function setupScheduleHostWidget() {
	const rootElement = document.querySelector('[data-schedule-host-widget]')
	if (!(rootElement instanceof HTMLElement)) return

	const appRoot = document.documentElement
	const shareTokenElement = getElement<HTMLElement>(
		rootElement,
		'[data-share-token]',
	)
	const shareTokenInput = getElement<HTMLInputElement>(
		rootElement,
		'input[name="shareToken"]',
	)
	const statusElement = getElement<HTMLElement>(rootElement, '[data-status]')
	const hostIframe = getElement<HTMLIFrameElement>(
		rootElement,
		'[data-host-iframe]',
	)
	const attendeeLink = getElement<HTMLAnchorElement>(
		rootElement,
		'[data-attendee-link]',
	)
	const fullscreenToggleButton = rootElement.querySelector<HTMLButtonElement>(
		'[data-action="request-fullscreen"]',
	)
	const loadHostButton = getElement<HTMLButtonElement>(
		rootElement,
		'[data-action="load-host"]',
	)

	if (fullscreenToggleButton) {
		fullscreenToggleButton.hidden = true
	}

	let hasRequestedAutoFullscreen = false

	function setStatus(message: string, error = false) {
		statusElement.textContent = message
		statusElement.setAttribute('data-status-tone', error ? 'error' : 'normal')
	}

	function setShareToken(token: string) {
		const normalized = token.trim()
		if (!normalized) {
			setStatus('Share token is required.', true)
			return false
		}
		shareTokenInput.value = normalized
		shareTokenElement.textContent = normalized
		hostIframe.src = `/s/${encodeURIComponent(normalized)}/host`
		attendeeLink.href = `/s/${encodeURIComponent(normalized)}`
		setStatus('Host dashboard loaded.')
		return true
	}

	function updateFullscreenButton() {
		if (!fullscreenToggleButton) return
		const hostContext = hostBridge.getHostContext()
		const availableModes = readAvailableDisplayModes(hostContext)
		const supportsFullscreen =
			availableModes.length === 0 || availableModes.includes('fullscreen')
		if (!supportsFullscreen) {
			fullscreenToggleButton.hidden = true
			return
		}
		const displayMode = readDisplayMode(hostContext)
		const inFullscreen = displayMode === 'fullscreen'
		const canExitFullscreen =
			availableModes.length === 0 || availableModes.includes('inline')
		if (inFullscreen && !canExitFullscreen) {
			fullscreenToggleButton.hidden = true
			return
		}
		fullscreenToggleButton.hidden = false
		fullscreenToggleButton.textContent = inFullscreen
			? 'Exit fullscreen'
			: 'Fullscreen'
		fullscreenToggleButton.setAttribute(
			'aria-label',
			inFullscreen ? 'Exit fullscreen mode' : 'Request fullscreen mode',
		)
	}

	async function maybeAutoRequestFullscreen() {
		if (hasRequestedAutoFullscreen) return
		hasRequestedAutoFullscreen = true
		const hostContext = hostBridge.getHostContext()
		const availableModes = readAvailableDisplayModes(hostContext)
		const supportsFullscreen =
			availableModes.length === 0 || availableModes.includes('fullscreen')
		const displayMode = readDisplayMode(hostContext)
		if (!supportsFullscreen || displayMode === 'fullscreen') return
		const grantedMode = await hostBridge.requestDisplayMode('fullscreen')
		if (grantedMode === 'fullscreen') {
			updateFullscreenButton()
		}
	}

	async function toggleFullscreenMode() {
		const hostContext = hostBridge.getHostContext()
		const availableModes = readAvailableDisplayModes(hostContext)
		const displayMode = readDisplayMode(hostContext)
		const requestedMode = displayMode === 'fullscreen' ? 'inline' : 'fullscreen'
		if (availableModes.length > 0 && !availableModes.includes(requestedMode)) {
			throw new Error(
				`Host does not advertise ${requestedMode} mode support. Available modes: ${availableModes.join(', ')}`,
			)
		}
		const grantedMode = await hostBridge.requestDisplayMode(requestedMode)
		if (!grantedMode) {
			throw new Error(`Host did not grant ${requestedMode} mode request.`)
		}
		updateFullscreenButton()
	}

	const hostBridge = createWidgetHostBridge({
		appInfo: {
			name: 'schedule-host-widget',
			version: '1.0.0',
		},
		onRenderData: (renderData) => {
			const theme = readTheme(renderData)
			if (theme) {
				appRoot.setAttribute('data-theme', theme)
			} else {
				appRoot.removeAttribute('data-theme')
			}
			updateFullscreenButton()
			const params = extractScheduleToolInput(renderData)
			if (params.shareToken) {
				setShareToken(params.shareToken)
			}
		},
		onHostContextChanged: (hostContext) => {
			const theme = readTheme(hostContext)
			if (theme) {
				appRoot.setAttribute('data-theme', theme)
			} else {
				appRoot.removeAttribute('data-theme')
			}
			updateFullscreenButton()
			void maybeAutoRequestFullscreen()
		},
	})

	function maybeApplyToolInput(params: {
		shareToken: string | null
		attendeeName: string | null
	}) {
		if (!params.shareToken) return
		setShareToken(params.shareToken)
	}

	function handleToolInputMessage(message: unknown) {
		if (!isRecord(message)) return
		if (
			message.method !== 'ui/notifications/tool-input' &&
			message.method !== 'ui/notifications/tool-input-partial' &&
			message.method !== 'ui/notifications/tool-result'
		) {
			return
		}
		maybeApplyToolInput(extractScheduleToolInput(message))
	}

	loadHostButton.addEventListener('click', () => {
		const token = shareTokenInput.value.trim()
		if (!setShareToken(token)) return
		void hostBridge.sendUserMessageWithFallback(
			`Loaded Epic Scheduler host dashboard for share token ${token}.`,
		)
	})

	shareTokenInput.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return
		event.preventDefault()
		loadHostButton.click()
	})

	fullscreenToggleButton?.addEventListener('click', () => {
		setStatus('Updating display mode...')
		void toggleFullscreenMode()
			.then(() => setStatus('Display mode updated.'))
			.catch((error: unknown) => {
				const message =
					error instanceof Error
						? error.message
						: 'Unable to update display mode.'
				setStatus(message, true)
			})
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
		handleToolInputMessage(event.data)
		hostBridge.handleHostMessage(event.data)
	})

	void hostBridge.initialize().then((ready) => {
		updateFullscreenButton()
		if (!ready) return
		void maybeAutoRequestFullscreen()
	})
	hostBridge.requestRenderData()
	updateFullscreenButton()
	setStatus('Waiting for share token input.')
	const openAiBridge = (
		window as Window & {
			openai?: unknown
		}
	).openai
	maybeApplyToolInput(extractScheduleToolInput(openAiBridge))
	const widgetUrl = new URL(window.location.href)
	maybeApplyToolInput({
		shareToken: readNonEmptyString(widgetUrl.searchParams.get('shareToken')),
		attendeeName: readNonEmptyString(
			widgetUrl.searchParams.get('attendeeName') ??
				widgetUrl.searchParams.get('name'),
		),
	})
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', setupScheduleHostWidget, {
		once: true,
	})
} else {
	setupScheduleHostWidget()
}
