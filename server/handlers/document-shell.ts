import { Layout } from '#server/layout.ts'
import { render } from '#server/render.ts'

const defaultTitle = 'Epic Scheduler'
const defaultDescription =
	'Plan meetings with paintable availability grids and live overlap.'

/**
 * Single HTML response for every document route: empty `#root`, global styles,
 * and `client-entry.js`. The client router renders the full UI.
 */
export const documentShell = {
	middleware: [],
	async action() {
		return render(
			Layout({
				title: defaultTitle,
				description: defaultDescription,
			}),
		)
	},
}
