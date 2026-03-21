import { expect, test } from 'bun:test'
import { prefersHtmlDocumentForMcpGet } from './utils.ts'

function req(method: string, accept: string) {
	return new Request('https://example.com/mcp', {
		method,
		headers: { Accept: accept },
	})
}

test('prefersHtmlDocumentForMcpGet: browser-like Accept redirects', () => {
	expect(
		prefersHtmlDocumentForMcpGet(
			req('GET', 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'),
		),
	).toBe(true)
})

test('prefersHtmlDocumentForMcpGet: curl */* does not redirect', () => {
	expect(prefersHtmlDocumentForMcpGet(req('GET', '*/*'))).toBe(false)
})

test('prefersHtmlDocumentForMcpGet: SSE prefers stream over HTML', () => {
	expect(prefersHtmlDocumentForMcpGet(req('GET', 'text/event-stream'))).toBe(
		false,
	)
	expect(
		prefersHtmlDocumentForMcpGet(
			req('GET', 'text/html;q=0.5, text/event-stream;q=1'),
		),
	).toBe(false)
})

test('prefersHtmlDocumentForMcpGet: JSON preferred over HTML', () => {
	expect(
		prefersHtmlDocumentForMcpGet(
			req('GET', 'application/json, text/html;q=0.9'),
		),
	).toBe(false)
})

test('prefersHtmlDocumentForMcpGet: HEAD matches GET', () => {
	expect(
		prefersHtmlDocumentForMcpGet(
			req('HEAD', 'text/html,application/xhtml+xml'),
		),
	).toBe(true)
})

test('prefersHtmlDocumentForMcpGet: POST never redirects', () => {
	expect(
		prefersHtmlDocumentForMcpGet(
			new Request('https://example.com/mcp', {
				method: 'POST',
				headers: {
					Accept: 'text/html',
					'Content-Type': 'application/json',
				},
				body: '{}',
			}),
		),
	).toBe(false)
})
