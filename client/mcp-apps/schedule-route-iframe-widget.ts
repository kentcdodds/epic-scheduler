import { extractScheduleToolInput } from './schedule-widget-tool-input.js'
import {
	createFullscreenManager,
	getWidgetElement,
	isRecord,
	readNonEmptyString,
	readTheme,
} from './schedule-widget-shared.js'
import { createWidgetHostBridge } from './widget-host-bridge.js'

type ScheduleRouteToolInput = {
	shareToken: string | null
	attendeeName: string | null
	hostAccessToken: string | null
}

type ScheduleRouteWidgetConfig = {
	rootSelector: string
	appInfo: {
		name: string
		version: string
	}
	label: string
	autoFullscreenErrorLabel: string
	waitingStatus: string
	loadSuccessMessage: string
	loadHostMessage: (params: {
		shareToken: string
		attendeeName: string | null
		hostAccessToken: string | null
	}) => string
	buildTarget: (params: {
		apiBaseUrl: URL
		shareToken: string
		attendeeName: string | null
		hostAccessToken: string | null
	}) => {
		iframeUrl?: URL | null
		attendeeLinkUrl?: URL | null
		statusMessage?: string
		error?: boolean
	}
}

function getApiBaseUrl(rootElement: HTMLElement) {
	const configuredBaseUrl = readNonEmptyString(rootElement.dataset.apiBaseUrl)
	if (configuredBaseUrl) return new URL('/', configuredBaseUrl)
	return new URL('/', window.location.href)
}

function getTrustedHostOrigin() {
	if (!document.referrer) return null
	try {
		return new URL(document.referrer).origin
	} catch {
		return null
	}
}

function toWidgetQueryToolInput() {
	const widgetUrl = new URL(window.location.href)
	return {
		shareToken: readNonEmptyString(widgetUrl.searchParams.get('shareToken')),
		attendeeName: readNonEmptyString(
			widgetUrl.searchParams.get('attendeeName') ??
				widgetUrl.searchParams.get('name'),
		),
		hostAccessToken: readNonEmptyString(
			widgetUrl.searchParams.get('hostAccessToken'),
		),
	} satisfies ScheduleRouteToolInput
}

function bindEnterToClick(
	inputs: ReadonlyArray<HTMLInputElement | null>,
	button: HTMLButtonElement,
) {
	for (const input of inputs) {
		input?.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return
			event.preventDefault()
			button.click()
		})
	}
}

export function setupScheduleRouteIframeWidget(
	config: ScheduleRouteWidgetConfig,
) {
	const rootElement = document.querySelector(config.rootSelector)
	if (!(rootElement instanceof HTMLElement)) return

	const appRoot = document.documentElement
	const shareTokenElement = getWidgetElement<HTMLElement>(
		rootElement,
		'[data-share-token]',
		config.label,
	)
	const shareTokenInput = getWidgetElement<HTMLInputElement>(
		rootElement,
		'input[name="shareToken"]',
		config.label,
	)
	const attendeeNameInput = rootElement.querySelector<HTMLInputElement>(
		'input[name="attendeeName"]',
	)
	const hostAccessTokenElement = rootElement.querySelector<HTMLElement>(
		'[data-host-access-token]',
	)
	const hostAccessTokenInput = rootElement.querySelector<HTMLInputElement>(
		'input[name="hostAccessToken"]',
	)
	const statusElement = getWidgetElement<HTMLElement>(
		rootElement,
		'[data-status]',
		config.label,
	)
	const routeIframe = getWidgetElement<HTMLIFrameElement>(
		rootElement,
		'[data-route-iframe]',
		config.label,
	)
	const attendeeLink = rootElement.querySelector<HTMLAnchorElement>(
		'[data-attendee-link]',
	)
	const fullscreenToggleButton = rootElement.querySelector<HTMLButtonElement>(
		'[data-action="request-fullscreen"]',
	)
	const loadButton = getWidgetElement<HTMLButtonElement>(
		rootElement,
		'[data-action="load-route"]',
		config.label,
	)

	if (fullscreenToggleButton) {
		fullscreenToggleButton.hidden = true
	}

	const apiBaseUrl = getApiBaseUrl(rootElement)
	let fullscreenManager: ReturnType<typeof createFullscreenManager> | null =
		null

	function setStatus(message: string, error = false) {
		statusElement.textContent = message
		statusElement.setAttribute('data-status-tone', error ? 'error' : 'normal')
	}

	function applyRouteTarget(params: ScheduleRouteToolInput) {
		const normalizedShareToken = params.shareToken?.trim() ?? ''
		const normalizedAttendeeName = params.attendeeName?.trim() ?? null
		const normalizedHostAccessToken = params.hostAccessToken?.trim() ?? null

		shareTokenInput.value = normalizedShareToken
		shareTokenElement.textContent = normalizedShareToken || 'Not provided'
		if (attendeeNameInput) {
			attendeeNameInput.value = normalizedAttendeeName ?? ''
		}
		if (hostAccessTokenInput) {
			hostAccessTokenInput.value = normalizedHostAccessToken ?? ''
		}
		if (hostAccessTokenElement) {
			hostAccessTokenElement.textContent =
				normalizedHostAccessToken || 'Not provided'
		}

		if (!normalizedShareToken) {
			if (attendeeLink) {
				attendeeLink.href = '#'
			}
			routeIframe.removeAttribute('src')
			setStatus('Share token is required.', true)
			return false
		}

		const target = config.buildTarget({
			apiBaseUrl,
			shareToken: normalizedShareToken,
			attendeeName: normalizedAttendeeName,
			hostAccessToken: normalizedHostAccessToken,
		})

		if (target.attendeeLinkUrl && attendeeLink) {
			attendeeLink.href = target.attendeeLinkUrl.toString()
		}

		if (!target.iframeUrl) {
			routeIframe.removeAttribute('src')
			setStatus(
				target.statusMessage ?? 'Unable to load the requested schedule page.',
				target.error ?? true,
			)
			return false
		}

		routeIframe.src = target.iframeUrl.toString()
		setStatus(target.statusMessage ?? config.loadSuccessMessage, target.error)
		return true
	}

	const hostBridge = createWidgetHostBridge({
		appInfo: config.appInfo,
		onRenderData: (renderData) => {
			const theme = readTheme(renderData)
			if (theme) {
				appRoot.setAttribute('data-theme', theme)
			} else {
				appRoot.removeAttribute('data-theme')
			}
			fullscreenManager?.updateFullscreenButton()
			maybeApplyToolInput(extractScheduleToolInput(renderData))
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
		autoFullscreenErrorLabel: config.autoFullscreenErrorLabel,
	})

	function maybeApplyToolInput(params: ScheduleRouteToolInput) {
		if (!params.shareToken && !params.attendeeName && !params.hostAccessToken) {
			return
		}

		const nextInput = {
			shareToken: params.shareToken ?? shareTokenInput.value,
			attendeeName: params.attendeeName ?? attendeeNameInput?.value ?? null,
			hostAccessToken:
				params.hostAccessToken ?? hostAccessTokenInput?.value ?? null,
		} satisfies ScheduleRouteToolInput

		applyRouteTarget(nextInput)
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

	loadButton.addEventListener('click', () => {
		const nextInput = {
			shareToken: shareTokenInput.value,
			attendeeName: attendeeNameInput?.value ?? null,
			hostAccessToken: hostAccessTokenInput?.value ?? null,
		} satisfies ScheduleRouteToolInput

		if (!applyRouteTarget(nextInput)) {
			return
		}

		void hostBridge.sendUserMessageWithFallback(
			config.loadHostMessage({
				shareToken: nextInput.shareToken?.trim() ?? '',
				attendeeName: readNonEmptyString(nextInput.attendeeName),
				hostAccessToken: readNonEmptyString(nextInput.hostAccessToken),
			}),
		)
	})

	bindEnterToClick(
		[shareTokenInput, attendeeNameInput, hostAccessTokenInput],
		loadButton,
	)

	fullscreenToggleButton?.addEventListener('click', () => {
		setStatus('Updating display mode...')
		void fullscreenManager
			?.toggleFullscreenMode()
			.then(() => {
				setStatus('Display mode updated.')
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error
						? error.message
						: 'Unable to update display mode.'
				setStatus(message, true)
			})
	})

	const trustedHostOrigin = getTrustedHostOrigin()
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
	setStatus(config.waitingStatus)

	const openAiBridge = (
		window as Window & {
			openai?: unknown
		}
	).openai
	maybeApplyToolInput(extractScheduleToolInput(openAiBridge))
	maybeApplyToolInput(toWidgetQueryToolInput())
}
