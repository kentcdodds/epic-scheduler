import { scheduleUiResourceUri } from '#shared/mcp-ui-resource-uris.ts'
import { renderScheduleUiShell } from './schedule-ui-shell.ts'

export { scheduleUiResourceUri }

export function renderScheduleUiEntryPoint(baseUrl: string | URL) {
	return renderScheduleUiShell({
		title: 'Epic Scheduler Availability App',
		baseUrl,
		rootClassName: 'schedule-widget',
		rootDataAttribute: 'data-schedule-widget',
		cardClassName: 'schedule-widget-card',
		widgetScriptPath: '/mcp-apps/schedule-widget.js',
		cardContents: `
			<h1>Your availability</h1>
			<p class="scheduler-muted">
				This MCP app loads the same attendee page as the web app, with the share
				token and attendee name applied from open_schedule_ui when provided.
			</p>
			<p class="scheduler-muted">
				Share token: <code data-share-token>Not provided</code>
			</p>
			<div class="scheduler-button-row">
				<button
					type="button"
					class="scheduler-secondary-button"
					data-action="request-fullscreen"
				>
					Fullscreen
				</button>
			</div>
			<div class="scheduler-inline-fields">
				<label class="scheduler-field">
					<span>Share token</span>
					<input name="shareToken" type="text" placeholder="Paste share token" />
				</label>
				<label class="scheduler-field">
					<span>Your name</span>
					<input name="attendeeName" type="text" placeholder="Add your name" />
				</label>
			</div>
			<div class="scheduler-button-row">
				<button type="button" class="scheduler-primary-button" data-action="load-route">
					Load attendee page
				</button>
			</div>
			<p class="scheduler-status" data-status aria-live="polite">
				Waiting for share token input.
			</p>
			<iframe
				data-route-iframe
				class="scheduler-route-frame"
				title="Epic Scheduler attendee page"
			></iframe>
		`,
	})
}
