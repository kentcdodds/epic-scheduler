import { html, type SafeHtml } from 'remix/html-template'

const defaultEntryScripts: Array<string> = ['/client-entry.js']
const defaultDescription =
	'Plan meetings with paintable availability grids and live overlap.'

const defaultShell = html`<div class="app-shell">
	<div
		class="loading-spinner"
		role="status"
		aria-live="polite"
		aria-label="Loading"
	></div>
</div>`
const scrollRestorationScript = html.raw`<script>
(() => {
	if (typeof window === 'undefined') return
	if ('scrollRestoration' in window.history) {
		window.history.scrollRestoration = 'manual'
	}
	const state =
		window.history.state && typeof window.history.state === 'object'
			? window.history.state
			: {}
	const existingKey =
		typeof state.key === 'string' && state.key.length > 0 ? state.key : null
	const key = existingKey ?? Math.random().toString(32).slice(2)
	if (!existingKey) {
		window.history.replaceState({ ...state, key }, '')
	}
	try {
		const storageKey = 'react-router-scroll-positions'
		const stored = sessionStorage.getItem(storageKey)
		if (!stored) return
		const positions = JSON.parse(stored)
		const storedY =
			positions && typeof positions === 'object' ? positions[key] : null
		if (typeof storedY === 'number') {
			const root = document.getElementById('root')
			if (root && storedY > 0) {
				const minHeight = storedY + window.innerHeight
				root.style.minHeight = String(minHeight) + 'px'
				root.setAttribute(
					'data-scroll-restoration-min-height',
					String(minHeight),
				)
			}
			window.scrollTo(0, storedY)
		}
	} catch {
		// Ignore storage failures, client router will handle restoration.
	}
})()
</script>`

/**
 * Full HTML document. Prefer empty `#root` (no `children`) so the client shell
 * owns the UI; `children` is only for rare static fallbacks.
 */
export function Layout({
	children,
	title = 'Epic Scheduler',
	description = defaultDescription,
	entryScripts = defaultEntryScripts,
}: {
	children?: SafeHtml
	title?: string
	description?: string
	entryScripts?: Array<string> | false
}) {
	const scripts = entryScripts === false ? [] : entryScripts
	const shell = children ?? defaultShell
	return html`<html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="description" content="${description}" />
			<link
				rel="icon"
				type="image/svg+xml"
				sizes="any"
				href="/epic-scheduler-favicon.svg"
			/>
			<link rel="icon" href="/favicon.ico" sizes="any" />
			<link
				rel="icon"
				type="image/png"
				sizes="32x32"
				href="/favicon-32x32.png"
			/>
			<link
				rel="icon"
				type="image/png"
				sizes="16x16"
				href="/favicon-16x16.png"
			/>
			<link
				rel="apple-touch-icon"
				sizes="180x180"
				href="/apple-touch-icon.png"
			/>
			<link rel="manifest" href="/site.webmanifest" />
			<meta name="theme-color" content="#5b3df5" />
			<title>${title}</title>
			<link rel="stylesheet" href="/styles.css" />
		</head>
		<body>
			<div id="root">${shell}</div>
			${scrollRestorationScript}
			${scripts.map(
				(script) => html`<script type="module" src="${script}"></script>`,
			)}
		</body>
	</html>`
}
