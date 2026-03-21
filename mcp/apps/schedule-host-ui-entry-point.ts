import { scheduleHostUiResourceUri } from '#shared/mcp-ui-resource-uris.ts'
import { renderScheduleUiShell } from './schedule-ui-shell.ts'

export { scheduleHostUiResourceUri }

export function renderScheduleHostUiEntryPoint(baseUrl: string | URL) {
	return renderScheduleUiShell({
		title: 'Epic Scheduler Host Dashboard App',
		baseUrl,
		rootClassName: 'schedule-host-widget',
		rootDataAttribute: 'data-schedule-host-widget',
		cardClassName: 'schedule-host-card',
		widgetScriptPath: '/mcp-apps/schedule-host-widget.js',
		cardContents: `
			<h1>Host dashboard</h1>
			<p class="scheduler-muted">
				This MCP app reuses the web host dashboard. Use the attendee app when
				someone is submitting their own availability.
			</p>
			<p class="scheduler-muted">
				Share token: <code data-share-token>Not provided</code>
			</p>
			<p class="scheduler-muted">
				Host access token: <code data-host-access-token>Not provided</code>
			</p>
			<div class="scheduler-button-row">
				<button
					type="button"
					class="scheduler-secondary-button"
					data-action="request-fullscreen"
				>
					Fullscreen
				</button>
				<a data-attendee-link href="#" class="scheduler-link">Open attendee view</a>
			</div>
			<div class="scheduler-inline-fields">
				<label class="scheduler-field">
					<span>Share token</span>
					<input name="shareToken" type="text" placeholder="Paste share token" />
				</label>
				<label class="scheduler-field">
					<span>Host access token</span>
					<input
						name="hostAccessToken"
						type="text"
						placeholder="Paste host access token"
					/>
				</label>
			</div>
			<div class="scheduler-button-row">
				<button
					type="button"
					class="scheduler-primary-button"
					data-action="load-route"
				>
					Load host dashboard
				</button>
			</div>
			<p class="scheduler-status" data-status aria-live="polite">
				Waiting for share token and host access token input.
			</p>
			<iframe
				data-route-iframe
				class="scheduler-route-frame"
				title="Epic Scheduler host dashboard"
			></iframe>
		`,
	})
}
