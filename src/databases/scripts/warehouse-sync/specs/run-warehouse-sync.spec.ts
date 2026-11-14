import { StockTransactionIdMongoGenerator } from '@modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-id-mongo.generator'
import { readFile, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import * as dailyPoStep from '../run-daily-po-step'
import * as stepsRunner from '../run-steps'
import {
	createWarehouseSyncRunner,
	runWarehouseSync,
	type WarehouseSyncConfig,
	type WarehouseSyncDependencies,
	type WarehouseSyncStageName
} from '../run-warehouse-sync'

jest.mock('../run-steps', () => {
	const actual = jest.requireActual<typeof import('../run-steps')>('../run-steps')
	return { ...actual, runSteps: jest.fn(actual.runSteps) }
})
jest.mock('../run-daily-po-step', () => {
	const actual = jest.requireActual<typeof import('../run-daily-po-step')>('../run-daily-po-step')
	return { ...actual, runDailyPoStep: jest.fn(actual.runDailyPoStep) }
})

const stageNames: WarehouseSyncStageName[] = [
	'users',
	'warehouses',
	'departments',
	'product specifications',
	'purchase orders',
	'manufacturing orders',
	'daily PO progress',
	'RFID devices',
	'EPC matches',
	'finished goods EPCs',
	'inventory audit',
	'daily MO inventory ledger',
	'truckload deliveries',
	'defective goods',
	'Excel report'
]

const config: WarehouseSyncConfig = {
	factoryCode: 'GL3',
	inboundDeviceSn: 'INBOUND',
	outboundDeviceSn: 'OUTBOUND',
	includeBackups: true,
	creatorUsername: 'creator',
	referenceWorkbook: '.tmp/gl3-inventory.xlsx',
	referenceSheet: 'ngày 12',
	outputFilename: '.tmp/warehouse-sync-test.xlsx',
	logFilename: '.tmp/warehouse-sync-test.log'
}

function fakeDependencies(runStage: (stage: WarehouseSyncStageName) => Promise<void>): WarehouseSyncDependencies {
	return Object.fromEntries(stageNames.map((name) => [name, () => runStage(name)])) as WarehouseSyncDependencies
}

describe('runWarehouseSync', () => {
	it('uses the fixed numeric 14+ MO rule without a prefix parameter', async () => {
		const requests: Record<string, string>[] = []
		const queries: string[] = []
		const writes: unknown[] = []
		const sizeLedger = JSON.stringify({
			'7': {
				order_qty: 5,
				stocked_in_qty: 2,
				total_recall_tx: 0,
				total_return_tx: 0,
				shipped_out_qty: 1
			}
		})
		const rows = ['14ABC', '99XYZ'].map((mo_no) => ({
			mo_no,
			brand_name: 'UGG',
			factory_code_produce: 'GL3',
			factory_shoes_style: 'F1',
			cust_shoes_style: 'C1',
			color_sn: 'BLACK',
			order_qty: 5,
			size_ledger: sizeLedger
		}))
		const pool = {
			request: () => {
				const parameters: Record<string, string> = {}
				return {
					input: (name: string, value: string) => {
						parameters[name] = value
					},
					toReadableStream: () => Readable.from(rows),
					query: async (sql: string) => {
						requests.push({ ...parameters })
						queries.push(sql)
					},
					cancel: () => true
				}
			}
		}
		const database = {
			collection: () => ({
				createIndex: async () => undefined,
				bulkWrite: async (operations: unknown[]) => {
					writes.push(...operations)
					return { isOk: () => true }
				}
			})
		}
		const stepsSpy = jest.mocked(stepsRunner.runSteps).mockImplementation(async (steps) => {
			for (const step of steps) if (step.name === 'manufacturing orders') await step.run()
		})
		try {
			await runWarehouseSync(pool as never, database as never, config, new Date('2026-11-12T00:00:00Z'))
			expect(requests).toEqual([{ FactoryCode: 'GL3', cutoff: '2026-11-12' }])
			expect(queries[0]).toMatch(/TRY_CONVERT\(int,\s*LEFT\(a\.mo_no,\s*2\)\)\s*>=\s*14/i)
			expect(writes).toHaveLength(2)
		} finally {
			stepsSpy.mockImplementation(jest.requireActual<typeof import('../run-steps')>('../run-steps').runSteps)
		}
	})

	it('runs every stage in order and writes the Excel report last', async () => {
		const calls: WarehouseSyncStageName[] = []
		const terminal: string[] = []
		const runner = createWarehouseSyncRunner(
			fakeDependencies(async (stage) => {
				calls.push(stage)
			}),
			(line) => terminal.push(line)
		)
		try {
			await runner({} as never, {} as never, config, new Date('2026-11-12T00:00:00.000Z'))
			expect(calls).toEqual(stageNames)
			expect(calls.at(-1)).toBe('Excel report')
			expect(terminal.some((line) => line.endsWith('START Excel report'))).toBe(true)
			expect(terminal.some((line) => line.endsWith('DONE Excel report'))).toBe(true)
			const fileLog = await readFile(config.logFilename, 'utf8')
			expect(fileLog).toContain('START users')
			expect(fileLog).toContain('DONE Excel report')
		} finally {
			await rm(config.logFilename, { force: true })
		}
	})

	it('runs only the selected collection step, including the storage locations alias', async () => {
		const calls: WarehouseSyncStageName[] = []
		const runner = createWarehouseSyncRunner(fakeDependencies(async (stage) => { calls.push(stage) }), () => {})
		try {
			await runner({} as never, {} as never, { ...config, step: 'storage_locations' })
			expect(calls).toEqual(['warehouses'])
		} finally {
			await rm(config.logFilename, { force: true })
		}
	})

	it('runs from a selected collection step through the report', async () => {
		const calls: WarehouseSyncStageName[] = []
		const runner = createWarehouseSyncRunner(fakeDependencies(async (stage) => { calls.push(stage) }), () => {})
		try {
			await runner({} as never, {} as never, { ...config, fromStep: 'mo_inventory_audit' })
			expect(calls).toEqual(stageNames.slice(stageNames.indexOf('inventory audit')))
		} finally {
			await rm(config.logFilename, { force: true })
		}
	})

	it('passes the continuation decision to the step runner', async () => {
		const calls: WarehouseSyncStageName[] = []
		const runner = createWarehouseSyncRunner(
			fakeDependencies(async (stage) => {
				calls.push(stage)
				if (stage === 'defective goods') throw new Error('sync failed')
			}),
			() => {},
			async () => true
		)
		try {
			await expect(runner({} as never, {} as never, { ...config, fromStep: 'defective_goods' }))
				.rejects.toThrow('sync failed')
			expect(calls).toEqual(['defective goods', 'Excel report'])
		} finally {
			await rm(config.logFilename, { force: true })
		}
	})

	it('stops at the first failure, logs it, and marks subsequent stages NOT_RUN', async () => {
		const calls: WarehouseSyncStageName[] = []
		const terminal: string[] = []
		const runner = createWarehouseSyncRunner(
			fakeDependencies(async (stage) => {
				calls.push(stage)
				if (stage === 'RFID devices') throw new Error('device sync failed')
			}),
			(line) => terminal.push(line)
		)
		try {
			await expect(runner({} as never, {} as never, config, new Date('2026-11-12T00:00:00.000Z'))).rejects.toThrow(
				'device sync failed'
			)
			expect(calls).toEqual(stageNames.slice(0, stageNames.indexOf('RFID devices') + 1))
			expect(terminal.some((line) => line.endsWith('FAIL RFID devices: device sync failed'))).toBe(true)
			expect(terminal.some((line) => line.endsWith('NOT_RUN Excel report'))).toBe(true)
			const fileLog = await readFile(config.logFilename, 'utf8')
			expect(fileLog).toContain('FAIL RFID devices: device sync failed')
			expect(fileLog).toContain('NOT_RUN Excel report')
		} finally {
			await rm(config.logFilename, { force: true })
		}
	})

	it.each([
		['2026-11-11T16:59:59.999Z', '2026-11-11'],
		['2026-11-11T17:00:00.000Z', '2026-11-12'],
		['2026-11-13T02:43:32.077Z', '2026-11-13']
	])('uses Vietnam midnight for all order stages at %s', async (instant, expectedCutoff) => {
		const cutoffs: string[] = []
		const pool = {
			request: () => {
				const parameters: Record<string, string> = {}
				return {
					input: (name: string, value: string) => {
						parameters[name] = value
					},
					toReadableStream: () => Readable.from([]),
					query: async () => {
						if (parameters.cutoff) cutoffs.push(parameters.cutoff)
					},
					cancel: () => true
				}
			}
		}
		const database = { collection: () => ({ createIndex: async () => undefined }) }
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		const stepsSpy = jest.mocked(stepsRunner.runSteps).mockImplementation(async (steps) => {
			for (const step of steps) {
				if (['purchase orders', 'manufacturing orders', 'daily PO progress'].includes(step.name)) await step.run()
			}
		})
		try {
			await runWarehouseSync(pool as never, database as never, config, new Date(instant))
			expect(cutoffs).toEqual([expectedCutoff, expectedCutoff, expectedCutoff])
		} finally {
			warn.mockRestore()
			stepsSpy.mockImplementation(jest.requireActual<typeof import('../run-steps')>('../run-steps').runSteps)
		}
	})

	it('allocates PO and MO IDs by transaction type and source date through the shared generator', async () => {
		const ledgerIds: string[][] = []
		const poIds: string[] = []
		const transaction = {
			time: '10:24',
			assembly_line: 'Line A',
			storage_location: 'WH A',
			size_ledger: { '07': { stocked_in_qty: 2 } }
		}
		const pool = {
			request: () => ({
				input: () => {},
				toReadableStream: () =>
					Readable.from([
						{
							mo_no: '15ABC',
							date: '2026-11-11',
							size_ledger: JSON.stringify(transaction.size_ledger),
							transaction_history: JSON.stringify([transaction, { ...transaction, time: '10:25' }])
						}
					]),
				query: async () => {},
				cancel: () => true
			})
		}
		const database = {
			collection: () => ({
				findOne: async () => null,
				bulkWrite: async (
					operations: Array<{ updateOne: { update: { $set: { transaction_history: object } } } }>
				) => {
					ledgerIds.push(Object.keys(operations[0].updateOne.update.$set.transaction_history))
				}
			})
		}
		const stepsSpy = jest.mocked(stepsRunner.runSteps).mockImplementation(async (steps) => {
			for (const step of steps) {
				if (step.name === 'daily PO progress' || step.name === 'daily MO inventory ledger') await step.run()
			}
		})
		const sequences = new Map<string, number>()
		const generatorSpy = jest.spyOn(StockTransactionIdMongoGenerator, 'fromDatabase').mockReturnValue({
			nextId: async (type, date) => {
				const key = `${type}-${date?.getFullYear()}-${date ? date.getMonth() + 1 : ''}-${date?.getDate()}`
				const sequence = (sequences.get(key) ?? 0) + 1
				sequences.set(key, sequence)
				return `${key}-${sequence}`
			}
		} as StockTransactionIdMongoGenerator)
		const poSpy = jest
			.mocked(dailyPoStep.runDailyPoStep)
			.mockImplementation(async (_pool, _db, _tenant, generateId) => {
				poIds.push(await generateId('2026-11-11'))
				return { scans: 0, documents: 0, quantity: 0 }
			})
		try {
			await runWarehouseSync(pool as never, database as never, config)
			await runWarehouseSync(pool as never, database as never, config)
			expect(ledgerIds).toEqual([
				['stock_in-2026-11-11-1', 'stock_in-2026-11-11-2'],
				['stock_in-2026-11-11-3', 'stock_in-2026-11-11-4']
			])
			expect(poIds).toEqual(['stock_out-2026-11-11-1', 'stock_out-2026-11-11-2'])
		} finally {
			generatorSpy.mockRestore()
			stepsSpy.mockImplementation(jest.requireActual<typeof import('../run-steps')>('../run-steps').runSteps)
			poSpy.mockImplementation(
				jest.requireActual<typeof import('../run-daily-po-step')>('../run-daily-po-step').runDailyPoStep
			)
		}
	})
})
