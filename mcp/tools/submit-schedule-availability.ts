import { type ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type MCP } from '#mcp/index.ts'

const submitAvailabilityTool = {
	name: 'submit_schedule_availability',
	title: 'Submit Schedule Availability',
	description:
		'Create or update one attendee availability selection for an existing schedule.',
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	} satisfies ToolAnnotations,
} as const

export async function registerSubmitScheduleAvailabilityTool(agent: MCP) {
	agent.server.registerTool(
		submitAvailabilityTool.name,
		{
			title: submitAvailabilityTool.title,
			description: submitAvailabilityTool.description,
			inputSchema: {
				shareToken: z.string(),
				attendeeName: z.string(),
				selectedSlots: z.array(z.string()).default([]),
			},
			outputSchema: {
				ok: z.literal(true),
				shareToken: z.string(),
				attendeeName: z.string(),
				selectedCount: z.number(),
			},
			annotations: submitAvailabilityTool.annotations,
		},
		async ({
			shareToken,
			attendeeName,
			selectedSlots,
		}: {
			shareToken: string
			attendeeName: string
			selectedSlots: Array<string>
		}) => {
			try {
				const scheduleRoom = agent.getScheduleRoomNamespace()
				const roomId = scheduleRoom.idFromName(shareToken)
				const room = scheduleRoom.get(roomId)
				const response = await room.fetch(
					'https://schedule-room/availability',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							shareToken,
							name: attendeeName,
							selectedSlots,
						}),
					},
				)
				if (!response.ok) {
					const payload = (await response.json().catch(() => null)) as {
						error?: string
					} | null
					const errorMessage =
						typeof payload?.error === 'string'
							? payload.error
							: 'Unable to update availability.'
					return {
						content: [{ type: 'text', text: errorMessage }],
						isError: true,
					}
				}

				return {
					content: [
						{
							type: 'text',
							text: `Updated availability for ${attendeeName}.`,
						},
					],
					structuredContent: {
						ok: true,
						shareToken,
						attendeeName,
						selectedCount: selectedSlots.length,
					},
				}
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Unable to update availability.'
				return {
					content: [{ type: 'text', text: message }],
					isError: true,
				}
			}
		},
	)
}
