import { extractScheduleToolInput } from './schedule-widget-tool-input.js'
import {
	createFullscreenManager,
	getWidgetElement,
	isRecord,
	readNonEmptyString,
	readTheme,
} from './schedule-widget-shared.js'
import { createWidgetHostBridge } from './widget-host-bridge.js'

const getElement = <T extends HTMLElement>(
	root: ParentNode,
	selector: string,
): T => getWidgetElement<T>(root, selector, 'host widget')

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

	let fullscreenManager: ReturnType<typeof createFullscreenManager> | null =
		null

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
			fullscreenManager?.updateFullscreenButton()
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
			fullscreenManager?.updateFullscreenButton()
			void fullscreenManager?.maybeAutoRequestFullscreen()
		},
	})

	fullscreenManager = createFullscreenManager({
		hostBridge,
		fullscreenToggleButton,
		autoFullscreenErrorLabel: 'schedule host widget',
	})

	async function toggleFullscreenMode() {
		if (!fullscreenManager) {
			throw new Error('Fullscreen controls are unavailable.')
		}
		return fullscreenManager.toggleFullscreenMode()
	}

	function maybeApplyToolInput(shareToken: string | null) {
		if (!shareToken) return
		setShareToken(shareToken)
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
		maybeApplyToolInput(extractScheduleToolInput(message).shareToken)
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
		fullscreenManager?.updateFullscreenButton()
		if (!ready) return
		void fullscreenManager?.maybeAutoRequestFullscreen()
	})
	hostBridge.requestRenderData()
	fullscreenManager?.updateFullscreenButton()
	setStatus('Waiting for share token input.')
	const openAiBridge = (
		window as Window & {
			openai?: unknown
		}
	).openai
	maybeApplyToolInput(extractScheduleToolInput(openAiBridge).shareToken)
	const widgetUrl = new URL(window.location.href)
	maybeApplyToolInput(
		readNonEmptyString(widgetUrl.searchParams.get('shareToken')),
	)
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', setupScheduleHostWidget, {
		once: true,
	})
} else {
	setupScheduleHostWidget()
}
