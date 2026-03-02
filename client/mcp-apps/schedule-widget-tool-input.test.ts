import { expect, test } from 'bun:test'
import { extractScheduleToolInput } from './schedule-widget-tool-input.ts'

test('extracts share token from toolInput render data', () => {
	const result = extractScheduleToolInput({
		payload: {
			renderData: {
				toolInput: {
					shareToken: 'abc123',
				},
			},
		},
	})

	expect(result.shareToken).toBe('abc123')
	expect(result.attendeeName).toBeNull()
})

test('extracts share token from toolOutput structured content', () => {
	const result = extractScheduleToolInput({
		payload: {
			renderData: {
				toolOutput: {
					structuredContent: {
						shareToken: 'output-token',
					},
				},
			},
		},
	})

	expect(result.shareToken).toBe('output-token')
})

test('extracts share token from tool-result notifications', () => {
	const result = extractScheduleToolInput({
		method: 'ui/notifications/tool-result',
		params: {
			structuredContent: {
				shareToken: 'result-token',
			},
		},
	})

	expect(result.shareToken).toBe('result-token')
})

test('supports snake_case keys and trims values', () => {
	const result = extractScheduleToolInput({
		arguments: {
			share_token: '  snake-token  ',
			attendee_name: '  Alex  ',
		},
	})

	expect(result.shareToken).toBe('snake-token')
	expect(result.attendeeName).toBe('Alex')
})

test('falls back to generic attendee name when provided', () => {
	const result = extractScheduleToolInput({
		params: {
			arguments: {
				name: 'Jamie',
			},
		},
	})

	expect(result.attendeeName).toBe('Jamie')
})

test('ignores blank token values', () => {
	const result = extractScheduleToolInput({
		toolOutput: {
			structuredContent: {
				shareToken: '    ',
			},
		},
	})

	expect(result.shareToken).toBeNull()
})
