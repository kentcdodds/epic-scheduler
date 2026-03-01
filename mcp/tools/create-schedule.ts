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

function toSafeCreateScheduleError(error: unknown) {
	const message = error instanceof Error ? error.message : ''
	if (
		/host name is required|invalid|must be|must|later than|too large|required/i.test(
			message,
		)
	) {
		return message
	}

	console.error('create_schedule tool failed:', error)
	return 'Unable to create schedule.'
}

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
					.describe(
						'Optional host-selected availability slots in UTC ISO timestamp format (examples: "2026-03-02T14:00:00.000Z", "2026-03-02T14:30:00.000Z"). Each value should align to the selected interval and fall within the [rangeStartUtc, rangeEndUtc) window.',
					),
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
				const message = toSafeCreateScheduleError(error)
				return {
					content: [{ type: 'text', text: message }],
					isError: true,
				}
			}
		},
	)
}
