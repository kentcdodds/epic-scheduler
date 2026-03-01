import { type MCP } from './index.ts'
import { registerScheduleAppResource } from './resources/schedule-app-resource.ts'

export async function registerResources(agent: MCP) {
	await registerScheduleAppResource(agent)
}
