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
		<title>Epic Scheduler MCP App</title>
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
			body {
				margin: 0;
				padding: var(--spacing-md);
				font-family: var(--font-family);
				background: var(--color-background);
				color: var(--color-text);
			}
			.scheduler-widget {
				display: grid;
				gap: var(--spacing-md);
				max-width: 40rem;
				margin: 0 auto;
				padding: var(--spacing-lg);
				border: 1px solid var(--color-border);
				border-radius: var(--radius-lg);
				background: var(--color-surface);
				box-shadow: var(--shadow-sm);
			}
			.scheduler-widget h1 {
				margin: 0;
				font-size: var(--font-size-lg);
			}
			.scheduler-widget h2 {
				margin: 0;
				font-size: var(--font-size-base);
			}
			.scheduler-widget p {
				margin: 0;
				color: var(--color-text-muted);
			}
			.scheduler-widget section {
				display: grid;
				gap: var(--spacing-sm);
				padding: var(--spacing-md);
				border: 1px solid var(--color-border);
				border-radius: var(--radius-md);
				background: color-mix(
					in srgb,
					var(--color-surface) 85%,
					var(--color-background)
				);
			}
			.scheduler-widget label {
				display: grid;
				gap: var(--spacing-xs);
				font-size: var(--font-size-sm);
			}
			.scheduler-widget input,
			.scheduler-widget select,
			.scheduler-widget textarea {
				padding: var(--spacing-sm);
				border-radius: var(--radius-md);
				border: 1px solid var(--color-border);
				background: var(--color-background);
				color: var(--color-text);
				font-family: inherit;
				font-size: var(--font-size-sm);
			}
			.scheduler-widget textarea {
				min-height: 5.5rem;
				resize: vertical;
			}
			.scheduler-widget button {
				padding: var(--spacing-sm) var(--spacing-md);
				border-radius: var(--radius-full);
				border: none;
				background: var(--color-primary);
				color: var(--color-on-primary);
				font-weight: var(--font-weight-semibold);
				cursor: pointer;
			}
			.scheduler-widget .muted-button {
				border: 1px solid var(--color-border);
				background: transparent;
				color: var(--color-text);
			}
			.scheduler-widget .row {
				display: flex;
				gap: var(--spacing-sm);
				flex-wrap: wrap;
				align-items: center;
			}
			.scheduler-widget pre {
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
				max-height: 16rem;
			}
		</style>
	</head>
	<body>
		<main class="scheduler-widget" data-schedule-widget>
			<header>
				<h1>Epic Scheduler MCP App</h1>
				<p>Create schedule links, submit attendee availability, and inspect overlap.</p>
			</header>

			<section>
				<h2>Create schedule</h2>
				<label>
					Title
					<input name="title" type="text" value="Scheduling poll" />
				</label>
				<div class="row">
					<label>
						Host name
						<input name="hostName" type="text" value="Host" />
					</label>
					<label>
						Interval
						<select name="interval">
							<option value="15">15m</option>
							<option value="30" selected>30m</option>
							<option value="60">60m</option>
						</select>
					</label>
				</div>
				<div class="row">
					<label>
						Start date
						<input name="startDate" type="date" />
					</label>
					<label>
						End date
						<input name="endDate" type="date" />
					</label>
				</div>
				<label>
					Selected slots (ISO, one per line)
					<textarea name="createSlots"></textarea>
				</label>
				<div class="row">
					<button type="button" data-action="create">Create schedule</button>
					<button type="button" class="muted-button" data-action="fill-demo-slots">
						Fill 9-5 weekdays
					</button>
				</div>
			</section>

			<section>
				<h2>Submit availability</h2>
				<label>
					Share token
					<input name="submitToken" type="text" />
				</label>
				<label>
					Attendee name
					<input name="attendeeName" type="text" />
				</label>
				<label>
					Selected slots (ISO, one per line)
					<textarea name="submitSlots"></textarea>
				</label>
				<button type="button" data-action="submit">Submit availability</button>
			</section>

			<section>
				<h2>Load snapshot</h2>
				<div class="row">
					<label>
						Share token
						<input name="snapshotToken" type="text" />
					</label>
					<button type="button" data-action="fetch">Load snapshot</button>
				</div>
				<pre data-output>Ready.</pre>
			</section>
		</main>

		<script type="module" src="${widgetScriptHref}" crossorigin="anonymous"></script>
	</body>
</html>
`.trim()
}
