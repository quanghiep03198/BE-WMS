import type { WarehouseSyncConfig } from './run-warehouse-sync'
import { selectWarehouseSyncStages, warehouseSyncStages } from './warehouse-sync-stages'

export interface WarehouseSyncCliOptions extends WarehouseSyncConfig {
	dbHost: string
	mongoDbName: string
	help: boolean
}

const valueOptions = new Set([
	'--db-host',
	'--mongo-db-name',
	'--factory-code',
	'--mo-prefix',
	'--inbound-device-sn',
	'--outbound-device-sn',
	'--creator-username',
	'--reference-workbook',
	'--reference-sheet',
	'--output-filename',
	'--log-filename',
	'--step',
	'--from-step'
])

export const warehouseSyncUsage = `Usage: bun run src/databases/scripts/warehouse-sync/run.ts --mo-prefix <prefix> --inbound-device-sn <serial> --outbound-device-sn <serial> [options]

Options:
  --db-host <host>                  MSSQL host (default: DB_HOST)
  --mongo-db-name <name>            MongoDB database (default: MONGO_DB_NAME)
  --factory-code <code>             Factory/tenant code (default: APP_TENANCY)
  --mo-prefix <prefix>              Two-digit manufacturing order prefix
  --inbound-device-sn <serial>      Inbound RFID device serial (required)
  --outbound-device-sn <serial>     Outbound RFID device serial (required)
  --include-backups                 Include daily backup scans
  --creator-username <username>     Creator for warehouse/delivery records (default: 1009006)
  --reference-workbook <file>       Reference workbook (default: .tmp/gl3-inventory.xlsx)
  --reference-sheet <name>          Workbook sheet (default: ngày 12)
  --output-filename <file>          Report file (default: .tmp/warehouse-sync-<timestamp>.xlsx)
  --log-filename <file>             Log file (default: .tmp/warehouse-sync.log)
  --step <collection>               Run only the selected step
  --from-step <collection>          Run from the selected step to the end
  --help                            Show this help without connecting to databases

Steps (in order): ${warehouseSyncStages.map(({ collection }) => collection).join(', ')}
  storage_locations is an alias for warehouses; excel_report is the report step.`

export function parseWarehouseSyncArgs(argv: string[]): WarehouseSyncCliOptions {
	const values = new Map<string, string>()
	let includeBackups = false
	let help = false

	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index]
		if (argument === '--help') {
			help = true
			continue
		}
		if (argument === '--include-backups') {
			if (values.has(argument) || includeBackups) throw new Error(`Duplicate option ${argument}`)
			if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
				throw new Error(`${argument} does not accept a value`)
			}
			includeBackups = true
			continue
		}
		if (!valueOptions.has(argument)) {
			throw new Error(`Unknown argument: ${argument}`)
		}
		if (values.has(argument)) throw new Error(`Duplicate option ${argument}`)
		const value = argv[index + 1]
		if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
		values.set(argument, value)
		index++
	}

	const envValue = (name: string) => process.env[name]?.trim() ?? ''
	const get = (option: string, fallback = '') => values.get(option)?.trim() ?? fallback
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const options: WarehouseSyncCliOptions = {
		dbHost: get('--db-host', envValue('DB_HOST')),
		mongoDbName: get('--mongo-db-name', envValue('MONGO_DB_NAME')),
		factoryCode: get('--factory-code', envValue('APP_TENANCY')),
		moPrefix: get('--mo-prefix'),
		inboundDeviceSn: get('--inbound-device-sn'),
		outboundDeviceSn: get('--outbound-device-sn'),
		includeBackups,
		creatorUsername: get('--creator-username', '1009006'),
		referenceWorkbook: get('--reference-workbook', '.tmp/gl3-inventory.xlsx'),
		referenceSheet: get('--reference-sheet', 'ngày 12'),
		outputFilename: get('--output-filename', `.tmp/warehouse-sync-${timestamp}.xlsx`),
		logFilename: get('--log-filename', '.tmp/warehouse-sync.log'),
		help,
		step: values.get('--step')?.trim(),
		fromStep: values.get('--from-step')?.trim()
	}

	if (help) return options
	selectWarehouseSyncStages(options.step, options.fromStep)
	for (const [option, value] of [
		['--db-host', options.dbHost],
		['--mongo-db-name', options.mongoDbName],
		['--factory-code', options.factoryCode],
		['--mo-prefix', options.moPrefix],
		['--inbound-device-sn', options.inboundDeviceSn],
		['--outbound-device-sn', options.outboundDeviceSn],
		['--creator-username', options.creatorUsername],
		['--reference-workbook', options.referenceWorkbook],
		['--reference-sheet', options.referenceSheet],
		['--output-filename', options.outputFilename],
		['--log-filename', options.logFilename]
	] as const) {
		if (!value) throw new Error(`A value is required for ${option}; provide it as an option or environment variable`)
	}
	if (!/^\d{2}$/.test(options.moPrefix)) throw new Error('--mo-prefix must be a two-digit number')
	return options
}
