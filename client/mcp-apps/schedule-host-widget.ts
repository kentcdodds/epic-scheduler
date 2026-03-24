import { setupScheduleRouteIframeWidget } from './schedule-route-iframe-widget.js'

function setupScheduleHostWidget() {
	setupScheduleRouteIframeWidget({
		rootSelector: '[data-schedule-host-widget]',
		appInfo: {
			name: 'schedule-host-widget',
			version: '2.0.0',
		},
		label: 'host widget',
		autoFullscreenErrorLabel: 'schedule host widget',
		waitingStatus: 'Waiting for share token and host access token input.',
		loadSuccessMessage: 'Host dashboard loaded.',
		loadHostMessage: ({ shareToken }) =>
			`Loaded Epic Scheduler host dashboard for share token ${shareToken}.`,
		buildTarget: ({ apiBaseUrl, shareToken, hostAccessToken }) => {
			const attendeeLinkUrl = new URL(
				`/s/${encodeURIComponent(shareToken)}`,
				apiBaseUrl,
			)
			if (!hostAccessToken) {
				return {
					attendeeLinkUrl,
					statusMessage:
						'Host access token is required to load the host dashboard.',
					error: true,
				}
			}
			const iframeUrl = new URL(
				`/s/${encodeURIComponent(shareToken)}/${encodeURIComponent(hostAccessToken)}`,
				apiBaseUrl,
			)
			return {
				iframeUrl,
				attendeeLinkUrl,
				statusMessage: 'Host dashboard loaded.',
			}
		},
	})
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', setupScheduleHostWidget, {
		once: true,
	})
} else {
	setupScheduleHostWidget()
}
