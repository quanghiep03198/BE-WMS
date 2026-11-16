import { parseEpcSyncArgs } from '../commands/epc-sync-args'

const required = ['--db-host', 'sql.example', '--mongo-db', 'warehouse']

describe('EPC sync arguments', () => {
	it('defaults connection options to the migration configuration', () => {
		expect(parseEpcSyncArgs([], { DB_HOST: 'file-host', MONGO_DB_NAME: 'file-db' })).toMatchObject({
			dbHost: 'file-host',
			mongoDatabase: 'file-db'
		})
	})

	it('accepts only the two database arguments and defaults to both stages', () => {
		expect(parseEpcSyncArgs(required)).toMatchObject({
			dbHost: 'sql.example',
			mongoDatabase: 'warehouse',
			stage: 'both',
			writeMode: 'upsert',
			concurrency: 4,
			batchSize: 1000,
			chunkSize: 10000
		})
	})

	it('accepts optional stage, device serials and tuning parameters', () => {
		expect(
			parseEpcSyncArgs([
				...required,
				'--stage',
				'epc',
				'--device-sn-101',
				'IN',
				'--device-sn-103',
				'OUT',
				'--concurrency',
				'2',
				'--batch-size',
				'2000',
				'--chunk-size',
				'4000',
				'--write-mode',
				'insert',
				'--include-backups'
			])
		).toMatchObject({
			stage: 'epc',
			inboundDeviceSn: 'IN',
			outboundDeviceSn: 'OUT',
			concurrency: 2,
			batchSize: 2000,
			chunkSize: 4000,
			writeMode: 'insert',
			includeBackups: true
		})
	})

	it.each([
		['--concurrency', '0'],
		['--concurrency', '1.5'],
		['--batch-size', '999'],
		['--batch-size', '5001'],
		['--chunk-size', '999'],
		['--stage', 'unknown'],
		['--write-mode', 'replace']
	])('rejects invalid %s value %s', (option, value) => {
		expect(() => parseEpcSyncArgs([...required, option, value])).toThrow()
	})

	it('rejects missing and duplicate arguments and system databases', () => {
		expect(() => parseEpcSyncArgs(required.slice(2))).toThrow(/db-host/i)
		expect(() => parseEpcSyncArgs([...required, '--db-host', 'other'])).toThrow(/duplicate/i)
		expect(() => parseEpcSyncArgs(['--db-host', 'sql', '--mongo-db', 'admin'])).toThrow(/database/i)
		expect(() => parseEpcSyncArgs([...required, '--include-backups', '--include-backups'])).toThrow(/duplicate/i)
	})
})
