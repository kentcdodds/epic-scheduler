import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
	type CallToolResult,
	type ContentBlock,
} from '@modelcontextprotocol/sdk/types.js'
import getPort from 'get-port'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const migrationsDir = join(projectRoot, 'migrations')
const bunBin = process.execPath
const defaultTimeoutMs = 60_000
const scheduleUiResourceUri = 'ui://schedule-app/entry-point.html'

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runWrangler(args: Array<string>) {
	const proc = Bun.spawn({
		cmd: [bunBin, 'x', 'wrangler', ...args],
		cwd: projectRoot,
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const stdoutPromise = proc.stdout
		? new Response(proc.stdout).text()
		: Promise.resolve('')
	const stderrPromise = proc.stderr
		? new Response(proc.stderr).text()
		: Promise.resolve('')
	const exitCode = await proc.exited
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
	if (exitCode !== 0) {
		throw new Error(
			`wrangler ${args.join(' ')} failed (${exitCode}). ${stderr || stdout}`,
		)
	}
	return { stdout, stderr }
}

async function createTestDatabase() {
	const persistDir = await mkdtemp(join(tmpdir(), 'epic-scheduler-mcp-e2e-'))

	await applyMigrations(persistDir)

	return {
		persistDir,
		[Symbol.asyncDispose]: async () => {
			await rm(persistDir, { recursive: true, force: true })
		},
	}
}

async function applyMigrations(persistDir: string) {
	const migrationFiles = await listMigrationFiles()
	if (migrationFiles.length === 0) {
		throw new Error('No migration files found in migrations directory.')
	}

	for (const migrationFile of migrationFiles) {
		await runWrangler([
			'd1',
			'execute',
			'APP_DB',
			'--local',
			'--env',
			'test',
			'--persist-to',
			persistDir,
			'--file',
			join('migrations', migrationFile),
		])
	}
}

async function listMigrationFiles() {
	const entries = await readdir(migrationsDir, { withFileTypes: true })
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right))
}

function captureOutput(stream: ReadableStream<Uint8Array> | null) {
	let output = ''
	if (!stream) {
		return () => output
	}

	const reader = stream.getReader()
	const decoder = new TextDecoder()

	const read = async () => {
		try {
			while (true) {
				const { value, done } = await reader.read()
				if (done) break
				if (value) {
					output += decoder.decode(value)
				}
			}
		} catch {
			// Ignore stream errors while capturing output.
		}
	}

	void read()
	return () => output
}

function formatOutput(stdout: string, stderr: string) {
	const snippets: Array<string> = []
	if (stdout.trim()) {
		snippets.push(`stdout: ${stdout.trim().slice(-2000)}`)
	}
	if (stderr.trim()) {
		snippets.push(`stderr: ${stderr.trim().slice(-2000)}`)
	}
	return snippets.length > 0 ? ` Output:\n${snippets.join('\n')}` : ''
}

async function waitForServer(
	origin: string,
	proc: ReturnType<typeof Bun.spawn>,
	getStdout: () => string,
	getStderr: () => string,
) {
	let exited = false
	let exitCode: number | null = null
	void proc.exited
		.then((code) => {
			exited = true
			exitCode = code
		})
		.catch(() => {
			exited = true
		})

	const metadataUrl = new URL('/health', origin)
	const deadline = Date.now() + 25_000
	while (Date.now() < deadline) {
		if (exited) {
			throw new Error(
				`wrangler dev exited (${exitCode ?? 'unknown'}).${formatOutput(
					getStdout(),
					getStderr(),
				)}`,
			)
		}
		try {
			const response = await fetch(metadataUrl)
			if (response.ok) {
				await response.body?.cancel()
				return
			}
		} catch {
			// Retry until the server is ready.
		}
		await delay(250)
	}

	throw new Error(
		`Timed out waiting for dev server at ${origin}.${formatOutput(
			getStdout(),
			getStderr(),
		)}`,
	)
}

async function stopProcess(proc: ReturnType<typeof Bun.spawn>) {
	let exited = false
	void proc.exited.then(() => {
		exited = true
	})
	proc.kill('SIGINT')
	await Promise.race([proc.exited, delay(5_000)])
	if (!exited) {
		proc.kill('SIGKILL')
		await proc.exited
	}
}

async function startDevServer(persistDir: string) {
	const port = await getPort({ host: '127.0.0.1' })
	const inspectorPortBase =
		port + 10_000 <= 65_535 ? port + 10_000 : Math.max(1, port - 10_000)
	const inspectorPort = await getPort({
		host: '127.0.0.1',
		port: Array.from(
			{ length: 10 },
			(_, index) => inspectorPortBase + index,
		).filter((candidate) => candidate > 0 && candidate <= 65_535),
	})
	const origin = `http://127.0.0.1:${port}`
	const proc = Bun.spawn({
		cmd: [
			bunBin,
			'x',
			'wrangler',
			'dev',
			'--local',
			'--env',
			'test',
			'--port',
			String(port),
			'--inspector-port',
			String(inspectorPort),
			'--ip',
			'127.0.0.1',
			'--persist-to',
			persistDir,
			'--show-interactive-dev-session=false',
			'--log-level',
			'error',
		],
		cwd: projectRoot,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...process.env,
			CLOUDFLARE_ENV: 'test',
		},
	})

	const getStdout = captureOutput(proc.stdout)
	const getStderr = captureOutput(proc.stderr)

	await waitForServer(origin, proc, getStdout, getStderr)

	return {
		origin,
		[Symbol.asyncDispose]: async () => {
			await stopProcess(proc)
		},
	}
}

async function createMcpClient(origin: string) {
	const serverUrl = new URL('/mcp', origin)
	const transport = new StreamableHTTPClientTransport(serverUrl)
	const client = new Client(
		{ name: 'mcp-e2e', version: '1.0.0' },
		{ capabilities: {} },
	)

	await client.connect(transport)

	return {
		client,
		[Symbol.asyncDispose]: async () => {
			await client.close()
		},
	}
}

test(
	'mcp server lists scheduler tools',
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin)

		const result = await mcpClient.client.listTools()
		const toolNames = result.tools.map((tool) => tool.name)

		expect(toolNames.sort()).toEqual([
			'create_schedule',
			'get_schedule_snapshot',
			'open_schedule_ui',
			'submit_schedule_availability',
		])
	},
	{ timeout: defaultTimeoutMs },
)

test(
	'mcp server lists resources',
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin)

		const instructions = mcpClient.client.getInstructions() ?? ''
		expect(instructions).toContain('Quick start')

		const resourcesResult = await mcpClient.client.listResources()
		const resourceUris = resourcesResult.resources.map(
			(resource) => resource.uri,
		)

		expect(resourceUris).toContain(scheduleUiResourceUri)
	},
	{ timeout: defaultTimeoutMs },
)

test(
	'mcp server creates and updates a schedule',
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin)

		const start = new Date()
		start.setMinutes(0, 0, 0)
		const end = new Date(start.getTime())
		end.setDate(end.getDate() + 3)

		const createResult = await mcpClient.client.callTool({
			name: 'create_schedule',
			arguments: {
				title: 'MCP test schedule',
				hostName: 'Host',
				intervalMinutes: 60,
				rangeStartUtc: start.toISOString(),
				rangeEndUtc: end.toISOString(),
				selectedSlots: [start.toISOString()],
			},
		})
		const createStructured = (createResult as CallToolResult)
			.structuredContent as Record<string, unknown> | undefined
		const shareToken =
			typeof createStructured?.shareToken === 'string'
				? createStructured.shareToken
				: ''
		expect(shareToken.length).toBeGreaterThan(4)

		const submitResult = await mcpClient.client.callTool({
			name: 'submit_schedule_availability',
			arguments: {
				shareToken,
				attendeeName: 'Alex',
				selectedSlots: [start.toISOString()],
			},
		})
		const submitStructured = (submitResult as CallToolResult)
			.structuredContent as Record<string, unknown> | undefined
		expect(submitStructured?.ok).toBe(true)

		const snapshotResult = await mcpClient.client.callTool({
			name: 'get_schedule_snapshot',
			arguments: {
				shareToken,
			},
		})
		const snapshotStructured = (snapshotResult as CallToolResult)
			.structuredContent as Record<string, unknown> | undefined
		expect(snapshotStructured?.ok).toBe(true)
		const snapshot = snapshotStructured?.snapshot as
			| { attendees?: Array<{ name?: string }> }
			| undefined
		const attendeeNames = (snapshot?.attendees ?? [])
			.map((attendee) => attendee.name)
			.filter((name): name is string => typeof name === 'string')
		expect(attendeeNames).toContain('Host')
		expect(attendeeNames).toContain('Alex')
	},
	{ timeout: defaultTimeoutMs },
)

test(
	'mcp server serves schedule ui resource',
	async () => {
		await using database = await createTestDatabase()
		await using server = await startDevServer(database.persistDir)
		await using mcpClient = await createMcpClient(server.origin)

		const result = await mcpClient.client.callTool({
			name: 'open_schedule_ui',
		})

		const structuredResult = (result as CallToolResult).structuredContent as
			| Record<string, unknown>
			| undefined
		expect(structuredResult?.widget).toBe('schedule')
		expect(structuredResult?.resourceUri).toBe(scheduleUiResourceUri)

		const textOutput =
			(result as CallToolResult).content.find(
				(item): item is Extract<ContentBlock, { type: 'text' }> =>
					item.type === 'text',
			)?.text ?? ''
		expect(textOutput).toContain('Epic Scheduler UI')

		const resourceResult = await mcpClient.client.readResource({
			uri: scheduleUiResourceUri,
		})
		const scheduleResource = resourceResult.contents.find(
			(content): content is { uri: string; mimeType?: string; text: string } =>
				content.uri === scheduleUiResourceUri &&
				'text' in content &&
				typeof content.text === 'string',
		)
		const scheduleResourceMeta = (
			resourceResult.contents.find(
				(content) => content.uri === scheduleUiResourceUri,
			) as { _meta?: Record<string, unknown> } | undefined
		)?._meta as
			| {
					ui?: {
						domain?: string
						csp?: {
							resourceDomains?: Array<string>
						}
					}
					'openai/widgetDomain'?: string
			  }
			| undefined

		expect(scheduleResource).toBeDefined()
		expect(scheduleResource?.mimeType).toBe('text/html;profile=mcp-app')
		expect(scheduleResource?.text).toContain('data-schedule-widget')
		expect(scheduleResource?.text).toContain('/mcp-apps/schedule-widget.js')
		expect(scheduleResource?.text).toContain('Create schedule')
		expect(scheduleResource?.text).toContain('Request fullscreen mode')

		const scheduleWidgetResponse = await fetch(
			new URL('/mcp-apps/schedule-widget.js', server.origin),
		)
		expect(scheduleWidgetResponse.ok).toBe(true)
		expect(
			scheduleWidgetResponse.headers.get('access-control-allow-origin'),
		).toBe('*')
		const scheduleWidgetSource = await scheduleWidgetResponse.text()
		expect(scheduleWidgetSource).toContain('createWidgetHostBridge')
		expect(scheduleWidgetSource).toContain('/api/schedules')
		expect(scheduleWidgetSource).toContain('ui/request-display-mode')

		const stylesResponse = await fetch(new URL('/styles.css', server.origin))
		expect(stylesResponse.ok).toBe(true)
		expect(stylesResponse.headers.get('access-control-allow-origin')).toBe('*')

		expect(scheduleResourceMeta?.ui?.domain).toBe(server.origin)
		expect(scheduleResourceMeta?.['openai/widgetDomain']).toBe(server.origin)
		expect(scheduleResourceMeta?.ui?.csp?.resourceDomains).toContain(
			server.origin,
		)
	},
	{ timeout: defaultTimeoutMs },
)
