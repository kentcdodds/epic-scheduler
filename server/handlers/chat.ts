import { type BuildAction } from 'remix/fetch-router'
import { type routes } from '#server/routes.ts'

export const chat = {
	middleware: [],
	async action({ request }) {
		const url = new URL(request.url)
		return Response.redirect(new URL('/how-it-works', url), 302)
	},
} satisfies BuildAction<typeof routes.chat.method, typeof routes.chat.pattern>
