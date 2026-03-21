import { setupScheduleRouteIframeWidget } from './schedule-route-iframe-widget.js'

function setupScheduleWidget() {
	setupScheduleRouteIframeWidget({
		rootSelector: '[data-schedule-widget]',
		appInfo: {
			name: 'schedule-widget',
			version: '4.0.0',
		},
		label: 'schedule widget',
		autoFullscreenErrorLabel: 'schedule widget',
		waitingStatus: 'Waiting for share token input.',
		loadSuccessMessage: 'Attendee page loaded.',
		loadHostMessage: ({ shareToken, attendeeName }) =>
			attendeeName
				? `Loaded Epic Scheduler attendee page for share token ${shareToken} as ${attendeeName}.`
				: `Loaded Epic Scheduler attendee page for share token ${shareToken}.`,
		buildTarget: ({ apiBaseUrl, shareToken, attendeeName }) => {
			const attendeeRouteUrl = new URL(
				`/s/${encodeURIComponent(shareToken)}`,
				apiBaseUrl,
			)
			if (attendeeName) {
				attendeeRouteUrl.searchParams.set('name', attendeeName)
			}
			return {
				iframeUrl: attendeeRouteUrl,
				statusMessage: 'Attendee page loaded.',
			}
		},
	})
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', setupScheduleWidget, {
		once: true,
	})
} else {
	setupScheduleWidget()
}
