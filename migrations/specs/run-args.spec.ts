import { existsSync } from 'node:fs'
import { parseWarehouseSyncArgs, warehouseSyncUsage } from '../commands/run-args'

describe('parseWarehouseSyncArgs', () => {
	const previousEnv = {
		DB_HOST: process.env.DB_HOST,
		MONGO_DB_NAME: process.env.MONGO_DB_NAME,
		APP_TENANCY: process.env.APP_TENANCY
	}

	beforeEach(() => {
		process.env.DB_HOST = 'mssql.local'
		process.env.MONGO_DB_NAME = 'warehouse'
		process.env.APP_TENANCY = 'VB2'
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
		expect(() => parseWarehouseSyncArgs([])).toThrow(/--device-sn-101/)
		expect(() => parseWarehouseSyncArgs(['--device-sn-101', 'in-1'])).toThrow(/--device-sn-103/)
	})

	it('applies generated output defaults', () => {
		const options = parseWarehouseSyncArgs(['--device-sn-101', 'in-1', '--device-sn-103', 'out-1'])

		expect(options.outputFilename).toBe('.tmp/warehouse-sync-2026-11-13T01-02-03-000Z.xlsx')
		expect(options.logFilename).toBe('logs/data-migration.log')
		expect(options.factoryCode).toBe('VB2')
		expect(options.dbHost).toBe('mssql.local')
		expect(options.mongoDbName).toBe('warehouse')
	})

	it('parses explicit overrides and boolean backup option', () => {
		const options = parseWarehouseSyncArgs([
			'--factory-code',
			'VN2',
			'--device-sn-101',
			'in-2',
			'--device-sn-103',
			'out-2',
			'--include-backups',
			'--creator-username',
			'operator',
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
			inboundDeviceSn: 'in-2',
			outboundDeviceSn: 'out-2',
			includeBackups: true,
			creatorUsername: 'operator',
			outputFilename: 'result.xlsx',
			logFilename: 'run.log',
			dbHost: 'mssql.override',
			mongoDbName: 'custom-db'
		})
	})

	it('accepts collection names for a single step or a starting step', () => {
		const args = ['--device-sn-101', 'in', '--device-sn-103', 'out']
		expect(parseWarehouseSyncArgs([...args, '--step', 'storage_locations']).step).toBe('storage_locations')
		expect(parseWarehouseSyncArgs([...args, '--from-step', 'daily_po_shipping_progress']).fromStep).toBe(
			'daily_po_shipping_progress'
		)
		expect(() => parseWarehouseSyncArgs([...args, '--step', 'unknown'])).toThrow(/step/i)
		expect(() => parseWarehouseSyncArgs([...args, '--step', 'users', '--from-step', 'warehouses'])).toThrow(
			/--step.*--from-step|--from-step.*--step/i
		)
	})

	it('provides a help path and rejects malformed or unknown arguments', () => {
		expect(parseWarehouseSyncArgs(['--help']).help).toBe(true)
		expect(() =>
			parseWarehouseSyncArgs(['--device-sn-101', 'in-1', '--device-sn-103', 'out-1', '--include-backups', 'false'])
		).toThrow(/does not accept a value/i)
		expect(() =>
			parseWarehouseSyncArgs(['--device-sn-101', 'in-1', '--device-sn-103', 'out-1', '--unknown'])
		).toThrow(/unknown/i)
	})

	it('shows a runnable entry point in the usage instructions', () => {
		const entryPoint = warehouseSyncUsage.match(/Usage: bun run (\S+)/)?.[1]
		expect(entryPoint).toBeDefined()
		expect(existsSync(entryPoint!)).toBe(true)
	})

	it('rejects the removed MO prefix option', () => {
		expect(() =>
			parseWarehouseSyncArgs(['--device-sn-101', 'in-1', '--device-sn-103', 'out-1', '--mo-prefix', '15'])
		).toThrow(/unknown argument/i)
		expect(parseWarehouseSyncArgs(['--help']).help).toBe(true)
	})

	it.each(['--reference-workbook', '--reference-sheet'])('rejects removed option %s', (option) => {
		expect(() => parseWarehouseSyncArgs([option, 'unused'])).toThrow(/unknown argument/i)
	})
})
