import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { scheduleUiResourceUri } from '#mcp/apps/schedule-ui-entry-point.ts'
import { type MCP } from '#mcp/index.ts'

const openScheduleUiTool = {
	name: 'open_schedule_ui',
	title: 'Open Schedule UI',
	description:
		'Open the Epic Scheduler MCP app widget for loading a share token, selecting attendee availability, and viewing overlap.',
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerOpenScheduleUiTool(agent: MCP) {
	registerAppTool(
		agent.server,
		openScheduleUiTool.name,
		{
			title: openScheduleUiTool.title,
			description: openScheduleUiTool.description,
			inputSchema: {
				shareToken: z
					.string()
					.optional()
					.describe(
						'Optional existing share token to load when the host can pass tool input into the UI render context.',
					),
				attendeeName: z
					.string()
					.optional()
					.describe(
						'Optional attendee name to prefill in the UI when host render context supports it.',
					),
			},
			outputSchema: {
				widget: z.literal('schedule'),
				resourceUri: z.literal(scheduleUiResourceUri),
				shareToken: z.string().optional(),
				attendeeName: z.string().optional(),
			},
			annotations: openScheduleUiTool.annotations,
			_meta: {
				ui: {
					resourceUri: scheduleUiResourceUri,
				},
			},
		},
		async ({
			shareToken,
			attendeeName,
		}: {
			shareToken?: string
			attendeeName?: string
		}) => {
			const normalizedShareToken = shareToken?.trim() || undefined
			const normalizedAttendeeName = attendeeName?.trim() || undefined
			return {
				content: [
					{
						type: 'text',
						text: normalizedShareToken
							? `Epic Scheduler availability UI is attached for share token ${normalizedShareToken}.`
							: 'Epic Scheduler availability UI is attached. Create links with create_schedule, then load the share token in this UI.',
					},
				],
				structuredContent: {
					widget: 'schedule',
					resourceUri: scheduleUiResourceUri,
					shareToken: normalizedShareToken,
					attendeeName: normalizedAttendeeName,
				},
			}
		},
	)
}
