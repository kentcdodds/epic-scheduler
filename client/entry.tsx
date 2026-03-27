import { createRoot } from 'remix/component'
import { App } from './app.tsx'

const rootElement = document.getElementById('root') ?? document.body
const scrollRestorationMinHeight = rootElement.getAttribute(
	'data-scroll-restoration-min-height',
)
if (rootElement.childNodes.length > 0) {
	// Remix alpha.3 auto-hydrates non-empty containers. We render from scratch.
	rootElement.replaceChildren()
}
createRoot(rootElement).render(<App />)
if (scrollRestorationMinHeight) {
	window.requestAnimationFrame(() => {
		rootElement.style.minHeight = ''
		rootElement.removeAttribute('data-scroll-restoration-min-height')
	})
}
