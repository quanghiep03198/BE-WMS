import type { MigrationEnv } from '../helpers/migration-env'
import { parseEpcSyncSettings } from './epc-sync-settings'
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
	'--device-sn-101',
	'--device-sn-103',
	'--creator-username',
	'--output-filename',
	'--log-filename',
	'--step',
	'--from-step',
	'--concurrency',
	'--batch-size',
	'--chunk-size',
	'--write-mode'
])

export const warehouseSyncUsage = `Usage: bun --no-env-file run migrations/run.ts [options]

Options:
  --db-host <host>                  MSSQL host (default: DB_HOST)
  --mongo-db-name <name>            MongoDB database (default: MONGO_DB_NAME)
  --factory-code <code>             Factory/tenant code (default: APP_TENANCY)
  --device-sn-101 <serial>          Inbound RFID device serial (default: DEVICE_SN_101)
  --device-sn-103 <serial>          Outbound RFID device serial (default: DEVICE_SN_103)
  --concurrency <n>                 EPC workers (default: 4)
  --batch-size <1000-5000>          EPC write batch size (default: 1000)
  --chunk-size <rows>               EPC worker chunk size (default: 10000)
  --write-mode <upsert|insert>      EPC write mode (default: upsert)
  --include-backups                 Include daily backup scans
  --no-cutoff                       Include scans from all dates in order and daily PO steps
  --creator-username <username>     Creator for warehouse/delivery records and fallback image owner (default: quanghiep)
  --output-filename <file>          Report file (default: .tmp/warehouse-sync-<timestamp>.xlsx)
  --log-filename <file>             Log file (default: logs/data-migration.log)
  --step <collection>               Run only the selected step
  --from-step <collection>          Run from the selected step to the end
  --help                            Show this help without connecting to databases

Steps (in order): ${warehouseSyncStages.map(({ collection }) => collection).join(', ')}
  storage_locations is an alias for warehouses; excel_report is the report step.`

export function parseWarehouseSyncArgs(argv: string[], config: MigrationEnv = process.env): WarehouseSyncCliOptions {
	const values = new Map<string, string>()
	let includeBackups = false
	let noCutoff = false
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
		if (argument === '--no-cutoff') {
			if (noCutoff) throw new Error(`Duplicate option ${argument}`)
			if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
				throw new Error(`${argument} does not accept a value`)
			}
			noCutoff = true
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

	const get = (option: string, fallback = '') => values.get(option)?.trim() ?? fallback
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const options: WarehouseSyncCliOptions = {
		dbHost: get('--db-host', config.DB_HOST?.trim() ?? ''),
		mongoDbName: get('--mongo-db-name', config.MONGO_DB_NAME?.trim() ?? ''),
		factoryCode: get('--factory-code', config.APP_TENANCY?.trim() ?? ''),
		inboundDeviceSn: get('--device-sn-101', config.DEVICE_SN_101?.trim() ?? ''),
		outboundDeviceSn: get('--device-sn-103', config.DEVICE_SN_103?.trim() ?? ''),
		epcSync: parseEpcSyncSettings(values),
		includeBackups,
		noCutoff,
		creatorUsername: get('--creator-username', 'quanghiep'),
		outputFilename: get('--output-filename', `.tmp/warehouse-sync-${timestamp}.xlsx`),
		logFilename: get('--log-filename', 'logs/data-migration.log'),
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
		['--device-sn-101', options.inboundDeviceSn],
		['--device-sn-103', options.outboundDeviceSn],
		['--creator-username', options.creatorUsername],
		['--output-filename', options.outputFilename],
		['--log-filename', options.logFilename]
	] as const) {
		if (!value) throw new Error(`A value is required for ${option}; provide it as an option or environment variable`)
	}
	return options
}
