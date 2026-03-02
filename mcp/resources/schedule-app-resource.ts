import {
	RESOURCE_MIME_TYPE,
	registerAppResource,
} from '@modelcontextprotocol/ext-apps/server'
import { createUIResource } from '@mcp-ui/server'
import {
	renderScheduleUiEntryPoint,
	scheduleUiResourceUri,
} from '#mcp/apps/schedule-ui-entry-point.ts'
import { type MCP } from '#mcp/index.ts'

function toHex(bytes: Uint8Array) {
	return Array.from(bytes)
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('')
}

async function getClaudeWidgetDomain(baseUrl: string | URL) {
	const mcpEndpoint = new URL('/mcp', baseUrl).toString()
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(mcpEndpoint),
	)
	const hashPrefix = toHex(new Uint8Array(digest)).slice(0, 32)
	return `${hashPrefix}.claudemcpcontent.com`
}

const scheduleAppResource = {
	name: 'schedule_app_resource',
	title: 'Schedule App Resource',
	description:
		'Interactive scheduler MCP app for selecting availability and viewing overlap on existing links.',
} as const

export async function registerScheduleAppResource(agent: MCP) {
	const baseUrl = agent.requireDomain()
	const assetOrigin = new URL('/styles.css', baseUrl).origin
	const claudeWidgetDomain = await getClaudeWidgetDomain(baseUrl)

	registerAppResource(
		agent.server,
		scheduleAppResource.name,
		scheduleUiResourceUri,
		{
			title: scheduleAppResource.title,
			description: scheduleAppResource.description,
		},
		async () => {
			const resource = createUIResource({
				uri: scheduleUiResourceUri,
				content: {
					type: 'rawHtml',
					htmlString: renderScheduleUiEntryPoint(baseUrl),
				},
				encoding: 'text',
				adapters: {
					mcpApps: {
						enabled: true,
					},
				},
			})

			return {
				contents: [
					{
						...resource.resource,
						mimeType: RESOURCE_MIME_TYPE,
						_meta: {
							ui: {
								prefersBorder: false,
								domain: claudeWidgetDomain,
								csp: {
									resourceDomains: [assetOrigin],
								},
							},
							'openai/widgetDomain': assetOrigin,
						},
					},
				],
			}
		},
	)
}
