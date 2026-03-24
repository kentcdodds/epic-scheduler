import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ensureD1Database, fail } from './wrangler-d1.ts'
import {
	formatWranglerJsonc,
	parseWranglerJsonc,
} from '../wrangler-jsonc-utils.ts'

type CliOptions = {
	wranglerConfigPath: string
	outConfigPath: string
	bindingName: string
	d1Location?: string
	dryRun: boolean
}

function parseArgs(argv: Array<string>): CliOptions {
	const options: CliOptions = {
		wranglerConfigPath: 'wrangler.jsonc',
		outConfigPath: 'wrangler-production.generated.json',
		bindingName: 'APP_DB',
		dryRun: false,
		d1Location: undefined,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (!arg) continue
		switch (arg) {
			case '--wrangler-config': {
				options.wranglerConfigPath = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--out-config': {
				options.outConfigPath = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--binding': {
				options.bindingName = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--d1-location': {
				options.d1Location = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--dry-run': {
				options.dryRun = true
				break
			}
			default: {
				if (arg.startsWith('-')) {
					fail(`Unknown flag: ${arg}`)
				}
			}
		}
	}

	if (!options.wranglerConfigPath) {
		fail('Missing value for --wrangler-config')
	}
	if (!options.outConfigPath) {
		fail('Missing value for --out-config')
	}
	if (!options.bindingName) {
		fail('Missing value for --binding')
	}

	return options
}

function readProductionD1DatabaseName(
	baseConfigPath: string,
	bindingName: string,
): string {
	const baseText = readFileSync(baseConfigPath, 'utf8')
	const config = parseWranglerJsonc<Record<string, unknown>>(baseText)
	const env = config.env
	if (!env || typeof env !== 'object') {
		fail(`wrangler config "${baseConfigPath}" is missing "env".`)
	}

	const productionEnv = (env as Record<string, unknown>).production
	if (!productionEnv || typeof productionEnv !== 'object') {
		fail(`wrangler config "${baseConfigPath}" is missing "env.production".`)
	}

	const d1Databases = (productionEnv as Record<string, unknown>).d1_databases
	if (!Array.isArray(d1Databases)) {
		fail(
			`wrangler config "${baseConfigPath}" is missing "env.production.d1_databases".`,
		)
	}

	const entry = d1Databases.find((item) => {
		if (!item || typeof item !== 'object') return false
		return (item as Record<string, unknown>).binding === bindingName
	}) as Record<string, unknown> | undefined

	if (!entry) {
		fail(
			`wrangler config "${baseConfigPath}" has no production D1 binding "${bindingName}".`,
		)
	}

	const databaseName = entry.database_name
	if (typeof databaseName !== 'string' || databaseName.length === 0) {
		fail(
			`wrangler config "${baseConfigPath}" production D1 "${bindingName}" is missing database_name.`,
		)
	}

	return databaseName
}

async function writeProductionWranglerConfig({
	baseConfigPath,
	outConfigPath,
	d1DatabaseName,
	d1DatabaseId,
	bindingName,
}: {
	baseConfigPath: string
	outConfigPath: string
	d1DatabaseName: string
	d1DatabaseId: string
	bindingName: string
}) {
	const baseText = await readFile(baseConfigPath, 'utf8')
	const config = parseWranglerJsonc<Record<string, unknown>>(baseText)
	const env = config.env
	if (!env || typeof env !== 'object') {
		fail(`wrangler config "${baseConfigPath}" is missing "env".`)
	}

	const productionEnv = (env as Record<string, unknown>).production
	if (!productionEnv || typeof productionEnv !== 'object') {
		fail(`wrangler config "${baseConfigPath}" is missing "env.production".`)
	}

	const d1Databases = (productionEnv as Record<string, unknown>).d1_databases
	if (!Array.isArray(d1Databases)) {
		fail(
			`wrangler config "${baseConfigPath}" is missing "env.production.d1_databases".`,
		)
	}

	const d1EntryIndex = d1Databases.findIndex((item) => {
		if (!item || typeof item !== 'object') return false
		return (item as Record<string, unknown>).binding === bindingName
	})
	if (d1EntryIndex < 0) {
		fail(
			`wrangler config "${baseConfigPath}" has no production D1 binding "${bindingName}".`,
		)
	}

	const d1Entry = d1Databases[d1EntryIndex] as Record<string, unknown>
	d1Databases[d1EntryIndex] = {
		...d1Entry,
		database_name: d1DatabaseName,
		database_id: d1DatabaseId,
	}

	const resolvedOut = path.resolve(outConfigPath)
	await writeFile(resolvedOut, formatWranglerJsonc(config), 'utf8')
	console.error(`Wrote generated Wrangler config: ${resolvedOut}`)
	return resolvedOut
}

async function main() {
	const options = parseArgs(process.argv.slice(2))

	if (!process.env.CLOUDFLARE_API_TOKEN && !options.dryRun) {
		fail(
			'Missing CLOUDFLARE_API_TOKEN (required for Wrangler resource operations).',
		)
	}

	const databaseName = readProductionD1DatabaseName(
		options.wranglerConfigPath,
		options.bindingName,
	)

	const d1 = ensureD1Database({
		name: databaseName,
		location: options.d1Location,
		dryRun: options.dryRun,
	})

	const generatedConfigPath = await writeProductionWranglerConfig({
		baseConfigPath: options.wranglerConfigPath,
		outConfigPath: options.outConfigPath,
		d1DatabaseName: d1.name,
		d1DatabaseId: d1.id,
		bindingName: options.bindingName,
	})

	console.log(`wrangler_config=${generatedConfigPath}`)
	console.log(`d1_database_name=${d1.name}`)
	console.log(`d1_database_id=${d1.id}`)
}

await main()
