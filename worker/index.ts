import { MCP } from '#mcp/index.ts'
import { handleRequest } from '#server/handler.ts'
import { withCors } from './utils.ts'

export { MCP }
export { ScheduleRoom } from './schedule-room.ts'

const mcpResourcePath = '/mcp'
const scheduleSocketPathPrefix = '/ws/'

const appHandler = withCors({
	getCorsHeaders(request) {
		const origin = request.headers.get('Origin')
		if (!origin) return null
		const requestOrigin = new URL(request.url).origin
		if (origin !== requestOrigin) return null
		return {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'content-type, authorization',
			Vary: 'Origin',
		}
	},
	async handler(request, env, ctx) {
		const url = new URL(request.url)

		if (url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
			return new Response(null, { status: 204 })
		}

		if (url.pathname === mcpResourcePath) {
			const mcpContext = ctx as ExecutionContext<{ baseUrl: string }>
			;(
				mcpContext as ExecutionContext<{ baseUrl: string }> & {
					props?: { baseUrl: string }
				}
			).props = {
				baseUrl: url.origin,
			}
			return MCP.serve(mcpResourcePath, {
				binding: 'MCP_OBJECT',
			}).fetch(request, env, mcpContext)
		}

		if (url.pathname.startsWith(scheduleSocketPathPrefix)) {
			const shareToken = url.pathname.slice(scheduleSocketPathPrefix.length)
			if (!shareToken) {
				return Response.json(
					{ ok: false, error: 'Missing schedule token for realtime socket.' },
					{ status: 400 },
				)
			}
			const roomId = env.SCHEDULE_ROOM.idFromName(shareToken)
			const room = env.SCHEDULE_ROOM.get(roomId)
			return room.fetch(new Request('https://schedule-room/connect', request))
		}

		// Sandboxed widget iframes have an opaque origin, so JS/CSS loads become CORS fetches.
		// ChatGPT/MCP Jam can render with sandbox="allow-scripts", which requires these headers.
		if (
			env.ASSETS &&
			(request.method === 'GET' || request.method === 'HEAD') &&
			(url.pathname.startsWith('/mcp-apps/') || url.pathname === '/styles.css')
		) {
			const assetResponse = await env.ASSETS.fetch(request)
			if (assetResponse.status !== 404) {
				const headers = new Headers(assetResponse.headers)
				headers.set('Access-Control-Allow-Origin', '*')
				return new Response(assetResponse.body, {
					status: assetResponse.status,
					statusText: assetResponse.statusText,
					headers,
				})
			}
		}

		// Dev route: serve schedule UI for iframe testing (simulates ChatGPT/MCP Jam)
		if (
			url.pathname === '/dev/schedule-ui' &&
			(request.method === 'GET' || request.method === 'HEAD')
		) {
			const { renderScheduleUiEntryPoint } =
				await import('#mcp/apps/schedule-ui-entry-point.ts')
			const baseUrl = new URL('/', url.origin)
			const html = renderScheduleUiEntryPoint(baseUrl)
			return new Response(html, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
				},
			})
		}

		// Try to serve static assets for safe methods only
		if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD')) {
			const response = await env.ASSETS.fetch(request)
			if (response.ok) {
				return response
			}
		}

		return handleRequest(request, env)
	},
})

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return appHandler(request, env, ctx)
	},
} satisfies ExportedHandler<Env>
