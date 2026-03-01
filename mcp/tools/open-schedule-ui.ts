import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { scheduleUiResourceUri } from '#mcp/apps/schedule-ui-entry-point.ts'
import { type MCP } from '#mcp/index.ts'

const openScheduleUiTool = {
	name: 'open_schedule_ui',
	title: 'Open Schedule UI',
	description:
		'Open the Epic Scheduler MCP app widget for schedule data entry and snapshot viewing.',
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
			outputSchema: {
				widget: z.literal('schedule'),
				resourceUri: z.literal(scheduleUiResourceUri),
			},
			annotations: openScheduleUiTool.annotations,
			_meta: {
				ui: {
					resourceUri: scheduleUiResourceUri,
				},
			},
		},
		async () => {
			return {
				content: [
					{
						type: 'text',
						text: 'Epic Scheduler UI is attached to this tool call.',
					},
				],
				structuredContent: {
					widget: 'schedule',
					resourceUri: scheduleUiResourceUri,
				},
			}
		},
	)
}
