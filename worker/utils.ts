export function withCors<Props>({
	getCorsHeaders,
	handler,
}: {
	getCorsHeaders(
		request: Request,
	): Record<string, string> | Headers | null | undefined
	handler: CustomExportedHandler<Props>['fetch']
}): CustomExportedHandler<Props>['fetch'] {
	return async (request, env, ctx) => {
		const corsHeaders = getCorsHeaders(request)
		if (!corsHeaders) {
			return handler(request, env, ctx)
		}

		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			const headers = mergeHeaders(corsHeaders, {
				'Access-Control-Max-Age': '86400',
			})

			return new Response(null, { status: 204, headers })
		}

		// Call the original handler
		const response = await handler(request, env, ctx)
		const responseHasWebSocket = Boolean(
			(
				response as Response & {
					webSocket?: WebSocket
				}
			).webSocket,
		)
		if (response.status === 101 && responseHasWebSocket) {
			return response
		}

		// Add CORS headers to ALL responses, including early returns
		const newHeaders = mergeHeaders(response.headers, corsHeaders)
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		})
	}
}

/**
 * Merge multiple headers objects into one (uses set so headers are overridden)
 */
export function mergeHeaders(
	...headers: Array<ResponseInit['headers'] | null | undefined>
) {
	const merged = new Headers()
	for (const header of headers) {
		if (!header) continue
		for (const [key, value] of new Headers(header).entries()) {
			merged.set(key, value)
		}
	}
	return merged
}

export function wantsJson(request: Request) {
	return request.headers.get('Accept')?.includes('application/json') ?? false
}

/** Parses `Accept` header segments into explicit media-range → quality weights. */
function parseAcceptWeights(acceptHeader: string): Map<string, number> {
	const result = new Map<string, number>()
	if (!acceptHeader.trim()) return result

	for (const segment of acceptHeader.split(',')) {
		const parts = segment
			.trim()
			.split(';')
			.map((part) => part.trim())
		const mediaRange = parts[0]?.toLowerCase()
		if (!mediaRange) continue

		let quality = 1
		for (let i = 1; i < parts.length; i++) {
			const param = parts[i]
			if (!param) continue
			const [key, value] = param.split('=').map((fragment) => fragment.trim())
			if (key?.toLowerCase() === 'q') {
				const parsed = Number.parseFloat(value ?? '1')
				if (!Number.isNaN(parsed)) quality = parsed
			}
		}
		result.set(mediaRange, quality)
	}
	return result
}

/**
 * True when the client is clearly asking for an HTML document (typical browser
 * navigation) rather than MCP JSON-RPC or SSE. Used to redirect `/mcp` to the
 * human-readable about page.
 */
export function prefersHtmlDocumentForMcpGet(request: Request): boolean {
	if (request.method !== 'GET' && request.method !== 'HEAD') return false

	const acceptHeader = request.headers.get('Accept') ?? ''
	const weights = parseAcceptWeights(acceptHeader)
	const htmlQ = weights.get('text/html') ?? 0
	if (htmlQ <= 0) return false

	const sseQ = weights.get('text/event-stream') ?? 0
	if (sseQ >= htmlQ) return false

	const jsonQ = weights.get('application/json') ?? 0
	if (jsonQ > htmlQ) return false

	return true
}
