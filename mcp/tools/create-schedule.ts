import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { createSchedule } from '#shared/schedule-store.ts'
import { type MCP } from '#mcp/index.ts'

const createScheduleTool = {
	name: 'create_schedule',
	title: 'Create Schedule',
	description:
		'Create a new link-based schedule with interval, date range, host name, and initial availability.',
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

const intervalSchema = z.union([z.literal(15), z.literal(30), z.literal(60)])

export async function registerCreateScheduleTool(agent: MCP) {
	agent.server.registerTool(
		createScheduleTool.name,
		{
			title: createScheduleTool.title,
			description: createScheduleTool.description,
			inputSchema: {
				title: z.string().default('Scheduling poll'),
				hostName: z.string(),
				intervalMinutes: intervalSchema.default(30),
				rangeStartUtc: z.string().describe('ISO datetime in UTC.'),
				rangeEndUtc: z.string().describe('ISO datetime in UTC.'),
				selectedSlots: z
					.array(z.string())
					.default([])
					.describe('Array of selected slot timestamps in UTC ISO format.'),
			},
			outputSchema: {
				shareToken: z.string(),
				schedulePath: z.string(),
				scheduleUrl: z.string(),
			},
			annotations: createScheduleTool.annotations,
		},
		async ({
			title,
			hostName,
			intervalMinutes,
			rangeStartUtc,
			rangeEndUtc,
			selectedSlots,
		}: {
			title: string
			hostName: string
			intervalMinutes: 15 | 30 | 60
			rangeStartUtc: string
			rangeEndUtc: string
			selectedSlots: Array<string>
		}) => {
			try {
				const created = await createSchedule(agent.getAppDb(), {
					title,
					hostName,
					intervalMinutes,
					rangeStartUtc,
					rangeEndUtc,
					selectedSlots,
				})
				const schedulePath = `/s/${created.shareToken}`
				const scheduleUrl = new URL(
					schedulePath,
					agent.requireDomain(),
				).toString()

				return {
					content: [
						{
							type: 'text',
							text: `Created schedule: ${scheduleUrl}`,
						},
					],
					structuredContent: {
						shareToken: created.shareToken,
						schedulePath,
						scheduleUrl,
					},
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unable to create schedule.'
				return {
					content: [{ type: 'text', text: message }],
					isError: true,
				}
			}
		},
	)
}
