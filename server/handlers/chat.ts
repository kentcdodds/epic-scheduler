import { type BuildAction } from 'remix/fetch-router'
import { Layout } from '#server/layout.ts'
import { render } from '#server/render.ts'
import { type routes } from '#server/routes.ts'

export const chat = {
	middleware: [],
	async action() {
		return render(Layout({}))
	},
} satisfies BuildAction<typeof routes.chat.method, typeof routes.chat.pattern>
