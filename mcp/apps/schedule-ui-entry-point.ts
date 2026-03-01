export const scheduleUiResourceUri =
	'ui://schedule-app/entry-point.html' as const

export function renderScheduleUiEntryPoint(baseUrl: string | URL) {
	const stylesheetHref = new URL('/styles.css', baseUrl).toString()
	const widgetScriptHref = new URL(
		'/mcp-apps/schedule-widget.js',
		baseUrl,
	).toString()

	return `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Epic Scheduler Availability App</title>
		<link rel="stylesheet" href="${stylesheetHref}" />
		<style>
			:root {
				color-scheme: light dark;
			}
			:root[data-theme='light'] {
				color-scheme: light;
			}
			:root[data-theme='dark'] {
				color-scheme: dark;
			}
			* {
				box-sizing: border-box;
			}
			html,
			body {
				width: 100%;
				min-height: 100%;
			}
			body {
				margin: 0;
				padding: 0;
				font-family: var(--font-family);
				background: var(--color-background);
				color: var(--color-text);
			}
			.scheduler-widget {
				display: flex;
				justify-content: center;
				width: 100%;
				min-height: 100dvh;
				margin: 0;
				padding: var(--spacing-xl);
			}
			@supports not (height: 100dvh) {
				.scheduler-widget {
					min-height: 100vh;
				}
			}
			.scheduler-shell {
				display: grid;
				gap: var(--spacing-lg);
				width: min(100%, 52rem);
			}
			.scheduler-card {
				display: grid;
				gap: var(--spacing-md);
				padding: var(--spacing-lg);
				border: 1px solid var(--color-border);
				border-radius: var(--radius-lg);
				background: var(--color-surface);
				box-shadow: var(--shadow-sm);
			}
			.scheduler-hero {
				background: linear-gradient(
					140deg,
					color-mix(in srgb, var(--color-primary) 22%, var(--color-surface)),
					color-mix(in srgb, var(--color-primary) 8%, var(--color-background))
				);
			}
			.scheduler-hero img {
				width: min(100%, 18rem);
				height: auto;
			}
			.scheduler-card h1,
			.scheduler-card h2 {
				margin: 0;
			}
			.scheduler-card h1 {
				font-size: var(--font-size-xl);
			}
			.scheduler-card h2 {
				font-size: var(--font-size-base);
			}
			.scheduler-card p {
				margin: 0;
			}
			.scheduler-muted {
				color: var(--color-text-muted);
			}
			.scheduler-chip-row {
				display: flex;
				flex-wrap: wrap;
				gap: var(--spacing-xs);
			}
			.scheduler-chip {
				display: inline-flex;
				align-items: center;
				padding: var(--spacing-xs) var(--spacing-sm);
				border-radius: var(--radius-full);
				background-color: color-mix(
					in srgb,
					var(--color-primary) 14%,
					var(--color-surface)
				);
				color: var(--color-primary-text);
				font-size: var(--font-size-xs);
				font-weight: var(--font-weight-medium);
			}
			.scheduler-row {
				display: grid;
				gap: var(--spacing-md);
			}
			.scheduler-row-split {
				grid-template-columns: minmax(0, 1fr) auto;
				align-items: end;
			}
			.scheduler-button-row {
				display: flex;
				flex-wrap: wrap;
				gap: var(--spacing-sm);
				align-items: center;
			}
			.scheduler-field {
				display: grid;
				gap: var(--spacing-xs);
			}
			.scheduler-field span {
				font-size: var(--font-size-sm);
				color: var(--color-text);
				font-weight: var(--font-weight-medium);
			}
			.scheduler-field input,
			.scheduler-field select {
				padding: var(--spacing-sm);
				border-radius: var(--radius-md);
				border: 1px solid var(--color-border);
				background: var(--color-background);
				color: var(--color-text);
				font-family: inherit;
				font-size: var(--font-size-sm);
			}
			.scheduler-primary-button,
			.scheduler-secondary-button {
				padding: var(--spacing-sm) var(--spacing-md);
				border-radius: var(--radius-full);
				font-weight: var(--font-weight-semibold);
				font-size: var(--font-size-sm);
				cursor: pointer;
				font-family: inherit;
			}
			.scheduler-primary-button {
				border: none;
				background: var(--color-primary);
				color: var(--color-on-primary);
			}
			.scheduler-secondary-button {
				border: 1px solid var(--color-border);
				background: transparent;
				color: var(--color-text);
			}
			.scheduler-status {
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
				min-height: 1.4rem;
			}
			.scheduler-status[data-status-tone='error'] {
				color: var(--color-error);
			}
			.scheduler-grid-wrap {
				border: 1px solid var(--color-border);
				border-radius: var(--radius-lg);
				overflow: auto;
				background-color: var(--color-surface);
			}
			.scheduler-grid-wrap table {
				border-collapse: separate;
				border-spacing: 0;
				min-width: max(40rem, 100%);
				width: 100%;
			}
			.scheduler-grid-wrap th {
				background-color: var(--color-surface);
				padding: var(--spacing-xs) var(--spacing-sm);
				border-bottom: 1px solid var(--color-border);
				color: var(--color-text-muted);
				font-size: var(--font-size-xs);
				font-weight: var(--font-weight-medium);
			}
			.scheduler-grid-wrap th[scope='col'] {
				text-align: center;
				position: sticky;
				top: 0;
				z-index: 2;
			}
			.scheduler-grid-wrap th[scope='row'] {
				text-align: left;
				position: sticky;
				left: 0;
				z-index: 1;
				min-width: 4.8rem;
			}
			.scheduler-grid-wrap td {
				padding: 0;
				border-bottom: 1px solid var(--color-border);
				border-right: 1px solid var(--color-border);
				height: 2.25rem;
			}
			.scheduler-grid-empty {
				background: color-mix(
					in srgb,
					var(--color-background) 88%,
					var(--color-surface)
				);
			}
			.scheduler-slot {
				display: grid;
				place-items: center;
				width: 100%;
				height: 100%;
				min-height: 2.25rem;
				border: none;
				padding: var(--spacing-xs);
				color: var(--color-text);
				font-weight: var(--font-weight-medium);
				font-size: var(--font-size-xs);
				cursor: pointer;
			}
			.scheduler-slot:focus-visible {
				outline: 2px solid var(--color-primary);
				outline-offset: -2px;
			}
			.scheduler-slot.is-active {
				outline: 2px solid var(--color-primary);
				outline-offset: -2px;
			}
			.scheduler-slot.is-pending-add {
				box-shadow: inset 0 0 0 2px var(--color-primary);
			}
			.scheduler-slot.is-pending-remove {
				background-image: repeating-linear-gradient(
					135deg,
					color-mix(in srgb, var(--color-error) 24%, transparent) 0 6px,
					transparent 6px 12px
				);
			}
			.scheduler-slot-details ul {
				margin: 0;
				padding-left: 1rem;
				display: grid;
				gap: var(--spacing-xs);
			}
			.scheduler-slot-details li {
				color: var(--color-text);
				font-size: var(--font-size-sm);
			}
			.scheduler-output {
				margin: 0;
				overflow: auto;
				padding: var(--spacing-sm);
				border-radius: var(--radius-md);
				border: 1px solid var(--color-border);
				background: color-mix(
					in srgb,
					var(--color-background) 85%,
					var(--color-surface)
				);
				font-size: var(--font-size-xs);
				max-height: 15rem;
			}
			@media (max-width: 640px) {
				.scheduler-widget {
					padding: var(--spacing-md);
				}
				.scheduler-row-split {
					grid-template-columns: 1fr;
				}
				.scheduler-grid-wrap table {
					min-width: 100%;
				}
				.scheduler-grid-wrap td,
				.scheduler-slot {
					min-height: 2.65rem;
					height: 2.65rem;
					font-size: var(--font-size-sm);
				}
			}
		</style>
	</head>
	<body>
		<main class="scheduler-widget" data-schedule-widget>
			<div class="scheduler-shell">
				<header class="scheduler-card scheduler-hero">
					<img src="/epic-scheduler-logo.svg" alt="Epic Scheduler" />
					<h1 data-schedule-title>Schedule availability</h1>
					<p class="scheduler-muted">
						Create links with the create_schedule tool, then load a share token
						here to select availability and review overlap.
					</p>
					<div class="scheduler-chip-row">
						<span class="scheduler-chip">Tool-driven link creation</span>
						<span class="scheduler-chip">Shared schedule grid</span>
						<span class="scheduler-chip">Timezone-friendly updates</span>
					</div>
					<p class="scheduler-muted">
						Share token: <code data-share-token>Not loaded</code>
					</p>
				</header>

				<section class="scheduler-card">
					<h2>Open schedule link</h2>
					<div class="scheduler-row scheduler-row-split">
						<label class="scheduler-field">
							<span>Share token</span>
							<input name="snapshotToken" type="text" />
						</label>
						<div class="scheduler-button-row">
							<button
								type="button"
								class="scheduler-primary-button"
								data-action="fetch"
							>
								Load schedule
							</button>
							<button
								type="button"
								class="scheduler-secondary-button"
								data-action="request-fullscreen"
							>
								Request fullscreen mode
							</button>
						</div>
					</div>
					<p class="scheduler-muted" data-connection-label>
						Snapshot not loaded.
					</p>
					<p class="scheduler-muted">
						Need a new link first? Use the create_schedule MCP tool, then paste the
						returned token here.
					</p>
				</section>

				<section class="scheduler-card">
					<h2>Your availability</h2>
					<div class="scheduler-row scheduler-row-split">
						<label class="scheduler-field">
							<span>Your name</span>
							<input
								name="attendeeName"
								type="text"
								placeholder="Add your name"
							/>
						</label>
						<div class="scheduler-row">
							<button
								type="button"
								class="scheduler-primary-button"
								data-action="submit"
							>
								Save availability
							</button>
							<p class="scheduler-muted">
								<span data-selected-count>0</span> selected slot(s) -
								<span data-pending-count>0</span> pending
							</p>
						</div>
					</div>
					<p class="scheduler-muted">
						Desktop and mobile: tap/click cells to toggle slots. Times use your
						browser timezone: <strong data-browser-timezone>UTC</strong>
					</p>
					<p class="scheduler-status" data-status aria-live="polite">
						Load a schedule to begin.
					</p>
					<div class="scheduler-grid-wrap" data-grid-host>
						<p class="scheduler-muted" style="padding: var(--spacing-md)">
							No schedule loaded yet.
						</p>
					</div>
				</section>

				<section class="scheduler-card scheduler-slot-details" data-slot-details hidden></section>

				<section class="scheduler-card">
					<h2>API output</h2>
					<pre class="scheduler-output" data-output>Ready.</pre>
				</section>
			</div>
		</main>

		<script type="module" src="${widgetScriptHref}" crossorigin="anonymous"></script>
	</body>
</html>
`.trim()
}
