import type { MigrationEnv } from '../helpers/migration-env'
import { parseEpcSyncSettings, type EpcSyncSettings } from './epc-sync-settings'

export interface EpcSyncOptions extends EpcSyncSettings {
	dbHost: string
	mongoDatabase: string
	stage: 'match' | 'epc' | 'both'
	includeBackups: boolean
	inboundDeviceSn?: string
	outboundDeviceSn?: string
}

export function parseEpcSyncArgs(argv: string[], config: MigrationEnv = {}): EpcSyncOptions {
	const allowed = new Set([
		'--db-host',
		'--mongo-db',
		'--stage',
		'--write-mode',
		'--concurrency',
		'--batch-size',
		'--chunk-size',
		'--device-sn-101',
		'--device-sn-103'
	])
	const values = new Map<string, string>()
	let includeBackups = false
	for (let index = 0; index < argv.length; index++) {
		const key = argv[index]
		if (key === '--include-backups') {
			if (includeBackups) throw new Error('Duplicate EPC sync option --include-backups')
			includeBackups = true
			continue
		}
		if (!allowed.has(key)) throw new Error(`Unknown EPC sync option ${key}`)
		if (values.has(key)) throw new Error(`Duplicate EPC sync option ${key}`)
		const value = argv[index + 1]
		if (!value || value.startsWith('--') || !value.trim()) throw new Error(`Missing value for ${key}`)
		values.set(key, value.trim())
		index++
	}
	const required = (name: string, fallback?: string): string => {
		const value = values.get(name) ?? fallback?.trim()
		if (!value) throw new Error(`Missing ${name}`)
		return value
	}
	const stage = values.get('--stage') ?? 'both'
	if (stage !== 'match' && stage !== 'epc' && stage !== 'both') throw new Error('Invalid EPC sync stage')
	const mongoDatabase = required('--mongo-db', config.MONGO_DB_NAME)
	if (['admin', 'config', 'local'].includes(mongoDatabase.toLowerCase())) throw new Error('Invalid target database')
	const inboundDeviceSn = values.get('--device-sn-101')
	const outboundDeviceSn = values.get('--device-sn-103')
	const dbHost = required('--db-host', config.DB_HOST)
	return {
		dbHost,
		mongoDatabase,
		stage,
		...parseEpcSyncSettings(values),
		includeBackups,
		inboundDeviceSn,
		outboundDeviceSn
	}
}
