function escapeHtmlAttribute(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

type ScheduleUiShellConfig = {
	title: string
	baseUrl: string | URL
	rootClassName: string
	rootDataAttribute: string
	cardClassName: string
	cardContents: string
	widgetScriptPath: string
}

export function renderScheduleUiShell(config: ScheduleUiShellConfig) {
	const canonicalBaseUrl = new URL('/', config.baseUrl).toString()
	const stylesheetHref = new URL('/styles.css', canonicalBaseUrl).toString()
	const widgetScriptHref = new URL(
		config.widgetScriptPath,
		canonicalBaseUrl,
	).toString()
	const title = escapeHtmlAttribute(config.title)
	const rootClassName = escapeHtmlAttribute(config.rootClassName)
	const rootDataAttribute = config.rootDataAttribute.trim()
	const rootDataAttributeSuffix = rootDataAttribute.startsWith('data-')
		? rootDataAttribute.slice('data-'.length)
		: rootDataAttribute
	const cardClassName = escapeHtmlAttribute(config.cardClassName)
	const safeRootDataAttribute = `data-${rootDataAttributeSuffix.replaceAll(
		/[^a-zA-Z0-9-]/g,
		'',
	)}`

	return `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${title}</title>
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
			.scheduler-shell {
				display: flex;
				justify-content: center;
				width: 100%;
				min-height: 100dvh;
				margin: 0;
				padding: var(--spacing-lg);
			}
			@supports not (height: 100dvh) {
				.scheduler-shell {
					min-height: 100vh;
				}
			}
			.scheduler-card {
				display: grid;
				gap: var(--spacing-md);
				padding: var(--spacing-lg);
				border: 1px solid var(--color-border);
				border-radius: var(--radius-lg);
				background: var(--color-surface);
				box-shadow: var(--shadow-sm);
				width: min(100%, 80rem);
			}
			.scheduler-card h1,
			.scheduler-card p {
				margin: 0;
			}
			.scheduler-muted {
				color: var(--color-text-muted);
			}
			.scheduler-row {
				display: grid;
				gap: var(--spacing-sm);
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
			.scheduler-field input {
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
			.scheduler-inline-fields {
				display: grid;
				gap: var(--spacing-md);
				grid-template-columns: repeat(2, minmax(0, 1fr));
				align-items: end;
			}
			.scheduler-inline-fields[data-columns='3'] {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}
			.scheduler-route-frame {
				width: 100%;
				min-height: 70vh;
				border: 1px solid var(--color-border);
				border-radius: var(--radius-lg);
				background: var(--color-background);
			}
			.scheduler-link {
				color: var(--color-text-muted);
			}
			@media (max-width: 760px) {
				.scheduler-shell {
					padding: var(--spacing-md);
				}
				.scheduler-inline-fields,
				.scheduler-inline-fields[data-columns='3'] {
					grid-template-columns: 1fr;
				}
				.scheduler-route-frame {
					min-height: 62vh;
				}
			}
		</style>
	</head>
	<body>
		<main
			class="scheduler-shell ${rootClassName}"
			${safeRootDataAttribute}
			data-api-base-url="${escapeHtmlAttribute(canonicalBaseUrl)}"
		>
			<section class="scheduler-card ${cardClassName}">
				${config.cardContents}
			</section>
		</main>
		<script type="module" src="${widgetScriptHref}" crossorigin="anonymous"></script>
	</body>
</html>
`.trim()
}
