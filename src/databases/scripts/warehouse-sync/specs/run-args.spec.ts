import { parseWarehouseSyncArgs } from '../run-args'

describe('parseWarehouseSyncArgs', () => {
	const previousEnv = {
		DB_HOST: process.env.DB_HOST,
		MONGO_DB_NAME: process.env.MONGO_DB_NAME,
		APP_TENANCY: process.env.APP_TENANCY
	}

	beforeEach(() => {
		process.env.DB_HOST = 'mssql.local'
		process.env.MONGO_DB_NAME = 'warehouse'
		process.env.APP_TENANCY = 'GL3'
		jest.useFakeTimers().setSystemTime(new Date('2026-11-13T01:02:03.000Z'))
	})

	afterEach(() => {
		for (const [key, value] of Object.entries(previousEnv)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		jest.useRealTimers()
	})

	it('requires inbound and outbound device serials', () => {
		expect(() => parseWarehouseSyncArgs(['--mo-prefix', '15'])).toThrow(/--inbound-device-sn/)
		expect(() => parseWarehouseSyncArgs(['--mo-prefix', '15', '--inbound-device-sn', 'in-1'])).toThrow(
			/--outbound-device-sn/
		)
	})

	it('applies workbook and generated output defaults', () => {
		const options = parseWarehouseSyncArgs([
			'--inbound-device-sn',
			'in-1',
			'--outbound-device-sn',
			'out-1',
			'--mo-prefix',
			'15'
		])

		expect(options.referenceWorkbook).toBe('.tmp/gl3-inventory.xlsx')
		expect(options.referenceSheet).toBe('ngày 12')
		expect(options.outputFilename).toBe('.tmp/warehouse-sync-2026-11-13T01-02-03-000Z.xlsx')
		expect(options.logFilename).toBe('.tmp/warehouse-sync.log')
		expect(options.factoryCode).toBe('GL3')
		expect(options.dbHost).toBe('mssql.local')
		expect(options.mongoDbName).toBe('warehouse')
	})

	it('parses explicit overrides and boolean backup option', () => {
		const options = parseWarehouseSyncArgs([
			'--factory-code',
			'VN2',
			'--mo-prefix',
			'16',
			'--inbound-device-sn',
			'in-2',
			'--outbound-device-sn',
			'out-2',
			'--include-backups',
			'--creator-username',
			'operator',
			'--reference-workbook',
			'custom.xlsx',
			'--reference-sheet',
			'Sheet 1',
			'--output-filename',
			'result.xlsx',
			'--log-filename',
			'run.log',
			'--db-host',
			'mssql.override',
			'--mongo-db-name',
			'custom-db'
		])

		expect(options).toMatchObject({
			factoryCode: 'VN2',
			moPrefix: '16',
			inboundDeviceSn: 'in-2',
			outboundDeviceSn: 'out-2',
			includeBackups: true,
			creatorUsername: 'operator',
			referenceWorkbook: 'custom.xlsx',
			referenceSheet: 'Sheet 1',
			outputFilename: 'result.xlsx',
			logFilename: 'run.log',
			dbHost: 'mssql.override',
			mongoDbName: 'custom-db'
		})
	})

	it('accepts collection names for a single step or a starting step', () => {
		const args = ['--mo-prefix', '15', '--inbound-device-sn', 'in', '--outbound-device-sn', 'out']
		expect(parseWarehouseSyncArgs([...args, '--step', 'storage_locations']).step).toBe('storage_locations')
		expect(parseWarehouseSyncArgs([...args, '--from-step', 'daily_po_shipping_progress']).fromStep)
			.toBe('daily_po_shipping_progress')
		expect(() => parseWarehouseSyncArgs([...args, '--step', 'unknown'])).toThrow(/step/i)
		expect(() => parseWarehouseSyncArgs([...args, '--step', 'users', '--from-step', 'warehouses']))
			.toThrow(/--step.*--from-step|--from-step.*--step/i)
	})

	it('provides a help path and rejects malformed or unknown arguments', () => {
		expect(parseWarehouseSyncArgs(['--help']).help).toBe(true)
		expect(() =>
			parseWarehouseSyncArgs([
				'--inbound-device-sn',
				'in-1',
				'--outbound-device-sn',
				'out-1',
				'--mo-prefix',
				'15',
				'--include-backups',
				'false'
			])
		).toThrow(/does not accept a value/i)
		expect(() =>
			parseWarehouseSyncArgs([
				'--inbound-device-sn',
				'in-1',
				'--outbound-device-sn',
				'out-1',
				'--mo-prefix',
				'15',
				'--unknown'
			])
		).toThrow(/unknown/i)
	})
})
