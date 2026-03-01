import { invariant } from '@epic-web/invariant'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import { registerResources } from './register-resources.ts'
import { registerTools } from './register-tools.ts'

export type State = {}
export type Props = {
	baseUrl: string
}

const serverMetadata = {
	implementation: {
		name: 'epic-scheduler-mcp',
		version: '1.0.0',
	},
	instructions: `
Quick start
- Use 'create_schedule' to create a new scheduling link.
- Use 'submit_schedule_availability' to save attendee selections.
- Use 'get_schedule_snapshot' to inspect overlap and attendee participation.
- Use 'open_schedule_ui' to open the MCP app widget for schedule data entry and display.

How to chain tools safely
- First create a schedule, then submit attendee availability, then read the snapshot.
	`.trim(),
} as const

export class MCP extends McpAgent<Env, State, Props> {
	server = new McpServer(serverMetadata.implementation, {
		instructions: serverMetadata.instructions,
	})
	async init() {
		await registerResources(this)
		await registerTools(this)
	}
	requireDomain() {
		const baseUrl = this.props?.baseUrl
		invariant(
			baseUrl,
			'This should never happen, but somehow we did not get the baseUrl from the request handler',
		)
		return baseUrl
	}

	getAppDb() {
		return this.env.APP_DB
	}

	getScheduleRoomNamespace() {
		return this.env.SCHEDULE_ROOM
	}
}
