import type { mongo } from 'mongoose'
import { Types } from 'mongoose'
import { Readable } from 'node:stream'
import { runDailyMoInventoryLedgerStep } from '../commands/daily-mo-inventory-ledger'

interface LedgerRow {
	mo_no: string
	date: string
	size_ledger: string
	transaction_history: string
}

const defaultDepartmentId = new Types.ObjectId('000000000000000000000010')
const defaultLocationId = new Types.ObjectId('000000000000000000000020')

function createPool(rows: LedgerRow[]) {
	const parameters: Record<string, string> = {}
	const queries: string[] = []
	return {
		parameters,
		queries,
		pool: {
			request: () => ({
				input: (name: string, value: string) => {
					parameters[name] = value
				},
				toReadableStream: () => Readable.from(rows),
				query: async (sql: string) => {
					queries.push(sql)
				},
				cancel: () => true
			})
		}
	}
}

function createDatabase() {
	const documents = new Map<string, Record<string, unknown>>()
	const lookupDocuments = new Map<string, Map<string, Record<string, unknown>>>([
		['departments', new Map([[defaultDepartmentId.toHexString(), { code: 'Line A-1', name: 'Line A-1' }]])],
		['storage_locations', new Map([[defaultLocationId.toHexString(), { storage_num: 'WH A', name: 'WH A' }]])]
	])
	const lookupErrors = new Map<string, Error>()
	let bulkWrites = 0
	const database = {
		collection: (name: string) => {
			if (name !== 'daily_mo_inventory_ledger') {
				return {
					find: () => ({
						toArray: async () =>
							Array.from(lookupDocuments.get(name)?.entries() ?? [], ([id, document]) => ({
								_id: new Types.ObjectId(id),
								...document
							}))
					}),
					findOne: async (filter: { _id: Types.ObjectId }) => {
						const error = lookupErrors.get(name)
						if (error) throw error
						return lookupDocuments.get(name)?.get(filter._id.toHexString()) ?? null
					}
				}
			}
			return {
				findOne: async (filter: { mo_no: string; date: string }) =>
					documents.get(`${filter.mo_no}:${filter.date}`) ?? null,
				bulkWrite: async (
					operations: Array<{
						updateOne: {
							filter: { mo_no: string; date: string }
							update: { $set: Record<string, unknown> }
							upsert: boolean
						}
					}>
				) => {
					bulkWrites++
					for (const { updateOne } of operations) {
						const { mo_no, date } = updateOne.filter
						documents.set(`${mo_no}:${date}`, {
							...documents.get(`${mo_no}:${date}`),
							...updateOne.update.$set
						})
					}
				}
			}
		}
	} as unknown as mongo.Db
	return { database, documents, lookupDocuments, lookupErrors, getBulkWrites: () => bulkWrites }
}

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
	return {
		mo_no: '14ABC',
		date: '2026-11-11',
		size_ledger: JSON.stringify({ '07': { stocked_in_qty: 2 } }),
		transaction_history: JSON.stringify([
			{
				time: '10:24',
				assembly_line: 'Line A-1',
				storage_location: 'WH A',
				size_ledger: { '07': { stocked_in_qty: 2 } }
			}
		]),
		...overrides
	}
}

describe('runDailyMoInventoryLedgerStep', () => {
	it('writes matched ObjectIds and uses the smallest reference IDs for unmatched codes', async () => {
		const target = createDatabase()
		target.lookupDocuments.get('departments')?.clear()
		target.lookupDocuments.get('storage_locations')?.clear()
		const department = new Types.ObjectId('000000000000000000000010')
		const fallbackDepartment = new Types.ObjectId('000000000000000000000001')
		const location = new Types.ObjectId('000000000000000000000020')
		const fallbackLocation = new Types.ObjectId('000000000000000000000002')
		target.lookupDocuments.get('departments')?.set(department.toHexString(), { code: 'BA-01' })
		target.lookupDocuments.get('departments')?.set(fallbackDepartment.toHexString(), { code: 'OTHER' })
		target.lookupDocuments.get('storage_locations')?.set(location.toHexString(), { storage_num: 'S01' })
		target.lookupDocuments.get('storage_locations')?.set(fallbackLocation.toHexString(), { storage_num: 'OTHER' })
		const transaction = {
			time: '10:24',
			assembly_line: 'BA-01',
			storage_location: 'S01',
			size_ledger: { '07': { stocked_in_qty: 2 } }
		}
		const source = createPool([
			row({
				transaction_history: JSON.stringify([
					transaction,
					{ ...transaction, time: '10:25', assembly_line: 'UNKNOWN-CODE', storage_location: 'MISSING' }
				])
			})
		])
		let counter = 0
		const generateId = jest.fn(() => `tx-${++counter}`)

		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)
		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)

		expect(target.documents.get('14ABC:2026-11-11')?.transaction_history).toEqual({
			'tx-1': { ...transaction, assembly_line: department, storage_location: location, voided: false },
			'tx-2': {
				...transaction,
				time: '10:25',
				assembly_line: fallbackDepartment,
				storage_location: fallbackLocation,
				voided: false
			}
		})
		expect(generateId).toHaveBeenCalledTimes(2)
		expect(source.queries[0]).toMatch(/s\.dept_code\s+AS\s+assembly_line/i)
		expect(source.queries[0]).toMatch(/s\.storage\s+AS\s+storage_location/i)
		expect(source.queries[0]).not.toMatch(/dept_name|dv_warehouseccodedet/i)
	})

	it('keeps distinct transactions and their IDs when multiple unknown codes resolve to the same fallback', async () => {
		const target = createDatabase()
		const transaction = {
			time: '10:24',
			assembly_line: 'MISSING-1',
			storage_location: 'MISSING-1',
			size_ledger: { '07': { stocked_in_qty: 2 } }
		}
		const source = createPool([
			row({
				transaction_history: JSON.stringify([
					transaction,
					{ ...transaction, assembly_line: 'MISSING-2', storage_location: 'MISSING-2' }
				])
			})
		])
		let counter = 0
		const generateId = jest.fn(() => `tx-${++counter}`)

		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)
		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)

		const history = target.documents.get('14ABC:2026-11-11')?.transaction_history as Record<string, unknown>
		expect(Object.keys(history)).toEqual(['tx-1', 'tx-2'])
		expect(history['tx-1']).toEqual(history['tx-2'])
		expect(generateId).toHaveBeenCalledTimes(2)
	})

	it('retains a legacy string-based transaction ID when source codes resolve to its department and location names', async () => {
		const target = createDatabase()
		target.lookupDocuments.get('departments')?.set(defaultDepartmentId.toHexString(), {
			code: 'BA-01',
			name: { en: 'Line A-1' }
		})
		target.lookupDocuments.get('storage_locations')?.set(defaultLocationId.toHexString(), {
			storage_num: 'S01',
			name: 'WH A'
		})
		const legacy = JSON.parse(row().transaction_history)[0]
		target.documents.set('14ABC:2026-11-11', { transaction_history: { 'legacy-id': legacy } })
		const source = createPool([
			row({
				transaction_history: JSON.stringify([{ ...legacy, assembly_line: 'BA-01', storage_location: 's01' }])
			})
		])
		const generateId = jest.fn(() => 'new-id')

		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)

		expect(target.documents.get('14ABC:2026-11-11')?.transaction_history).toEqual({
			'legacy-id': {
				...legacy,
				assembly_line: defaultDepartmentId,
				storage_location: defaultLocationId,
				voided: false
			}
		})
		expect(generateId).not.toHaveBeenCalled()
	})

	it.each(['departments', 'storage_locations'])('fails without writing if %s is empty', async (collection) => {
		const target = createDatabase()
		target.lookupDocuments.get(collection)?.clear()
		await expect(
			runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'tx')
		).rejects.toThrow(`Empty ${collection} reference collection`)
		expect(target.getBulkWrites()).toBe(0)
	})

	it('falls back for null codes even when a department code is UNKNOWN', async () => {
		const target = createDatabase()
		target.lookupDocuments.get('departments')?.set('000000000000000000000030', { code: 'UNKNOWN' })
		const transaction = {
			time: '10:24',
			assembly_line: null,
			storage_location: '',
			size_ledger: { '07': { stocked_in_qty: 2 } }
		}
		await runDailyMoInventoryLedgerStep(
			createPool([row({ transaction_history: JSON.stringify([transaction]) })]).pool,
			target.database,
			() => 'tx'
		)
		expect(target.documents.get('14ABC:2026-11-11')?.transaction_history).toEqual({
			tx: { ...transaction, assembly_line: defaultDepartmentId, storage_location: defaultLocationId, voided: false }
		})
	})

	it('reuses IDs when fallback reference documents have no code or name', async () => {
		const target = createDatabase()
		target.lookupDocuments.get('departments')?.set(defaultDepartmentId.toHexString(), {})
		target.lookupDocuments.get('storage_locations')?.set(defaultLocationId.toHexString(), {})
		const generateId = jest.fn(() => 'tx')
		const source = createPool([row()])

		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)
		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)

		expect(generateId).toHaveBeenCalledTimes(1)
		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual(['tx'])
	})

	it('allocates asynchronous transaction IDs using the ledger date across documents', async () => {
		const source = createPool([row(), row({ mo_no: '14DEF' }), row({ mo_no: '14GHI', date: '2026-11-12' })])
		const target = createDatabase()
		const counters = new Map<string, number>()
		await runDailyMoInventoryLedgerStep(source.pool, target.database, async (date: string) => {
			const sequence = (counters.get(date) ?? 0) + 1
			counters.set(date, sequence)
			return `SI-${date}-${sequence}`
		})
		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual([
			'SI-2026-11-11-1'
		])
		expect(Object.keys(target.documents.get('14DEF:2026-11-11')?.transaction_history as object)).toEqual([
			'SI-2026-11-11-2'
		])
		expect(Object.keys(target.documents.get('14GHI:2026-11-12')?.transaction_history as object)).toEqual([
			'SI-2026-11-12-1'
		])
	})

	it('propagates ID allocation failures without writing a ledger', async () => {
		const target = createDatabase()
		await expect(
			runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, async () => {
				throw new Error('counter unavailable')
			})
		).rejects.toThrow('counter unavailable')
		expect(target.getBulkWrites()).toBe(0)
	})

	it('stores parsed ledgers and generated transaction keys using a read-only parameterized query', async () => {
		const source = createPool([row()])
		const target = createDatabase()

		await expect(runDailyMoInventoryLedgerStep(source.pool, target.database, () => 'tx-1')).resolves.toEqual({
			ledgers: 1
		})

		expect(source.parameters).toEqual({})
		expect(source.queries).toHaveLength(1)
		expect(source.queries[0]).toMatch(/TRY_CONVERT\(int,\s*LEFT\(mo_no,\s*2\)\)\s*>=\s*14/i)
		expect(source.queries[0]).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?)\b/i)
		expect(target.documents.get('14ABC:2026-11-11')).toEqual({
			mo_no: '14ABC',
			date: '2026-11-11',
			size_ledger: { '07': { stocked_in_qty: 2 } },
			created_at: new Date('2026-11-11T00:00:00.000Z'),
			transaction_history: {
				'tx-1': {
					time: '10:24',
					assembly_line: defaultDepartmentId,
					storage_location: defaultLocationId,
					size_ledger: { '07': { stocked_in_qty: 2 } },
					voided: false
				}
			}
		})
	})

	it.each(['13ABC', 'A4ABC'])('rejects ledger rows outside numeric prefix 14+: %s', async (moNo) => {
		const target = createDatabase()
		await expect(
			runDailyMoInventoryLedgerStep(createPool([row({ mo_no: moNo })]).pool, target.database, () => 'unused')
		).rejects.toThrow(/ineligible|invalid/i)
		expect(target.getBulkWrites()).toBe(0)
	})

	it.each([null, undefined])(
		'uses a stable fallback for a null or omitted assembly line: %p',
		async (assemblyLine) => {
			const transaction = {
				time: '10:24',
				assembly_line: assemblyLine,
				storage_location: null,
				size_ledger: { '07': { stocked_in_qty: 2 } }
			}
			const source = createPool([row({ transaction_history: JSON.stringify([transaction]) })])
			const target = createDatabase()
			const generateId = jest.fn(() => 'tx-1')

			await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)
			await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)

			expect(target.documents.get('14ABC:2026-11-11')?.transaction_history).toEqual({
				'tx-1': {
					...transaction,
					assembly_line: defaultDepartmentId,
					storage_location: defaultLocationId,
					voided: false
				}
			})
			expect(generateId).toHaveBeenCalledTimes(1)
		}
	)

	it('selects raw reference codes and includes null JSON values', async () => {
		const source = createPool([])
		await runDailyMoInventoryLedgerStep(source.pool, createDatabase().database, () => 'unused')

		expect(source.queries[0]).toMatch(/s\.dept_code\s+AS\s+assembly_line/i)
		expect(source.queries[0]).toMatch(/FOR JSON PATH,\s*INCLUDE_NULL_VALUES/i)
	})

	it.each([123])('rejects invalid non-null assembly lines: %p', async (assemblyLine) => {
		const transaction = {
			time: '10:24',
			assembly_line: assemblyLine,
			storage_location: null,
			size_ledger: { '07': { stocked_in_qty: 2 } }
		}
		const target = createDatabase()
		await expect(
			runDailyMoInventoryLedgerStep(
				createPool([row({ transaction_history: JSON.stringify([transaction]) })]).pool,
				target.database,
				() => 'unused'
			)
		).rejects.toThrow(/assembly_line/)
		expect(target.getBulkWrites()).toBe(0)
	})

	it('skips records with an empty ledger or transaction history', async () => {
		const source = createPool([row({ size_ledger: '{}' }), row({ transaction_history: '[]' })])
		const target = createDatabase()

		await expect(runDailyMoInventoryLedgerStep(source.pool, target.database, () => 'unused')).resolves.toEqual({
			ledgers: 0
		})

		expect(target.documents.size).toBe(0)
		expect(target.getBulkWrites()).toBe(0)
	})

	it('rejects malformed JSON and transactions missing required fields', async () => {
		const malformed = createPool([row({ size_ledger: '{' })])
		const malformedTarget = createDatabase()
		await expect(
			runDailyMoInventoryLedgerStep(malformed.pool, malformedTarget.database, () => 'tx-1')
		).rejects.toThrow()

		const incomplete = createPool([
			row({
				transaction_history: JSON.stringify([
					{ assembly_line: 'Line A', storage_location: null, size_ledger: { '07': { stocked_in_qty: 2 } } }
				])
			})
		])
		const incompleteTarget = createDatabase()
		await expect(
			runDailyMoInventoryLedgerStep(incomplete.pool, incompleteTarget.database, () => 'tx-1')
		).rejects.toThrow()
		expect(incompleteTarget.documents.size).toBe(0)
	})

	it('upserts an existing MO and date instead of adding another ledger on rerun', async () => {
		const source = createPool([row()])
		const target = createDatabase()
		const generateId = () => 'stable-id'

		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)
		await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)

		expect(target.documents.size).toBe(1)
		expect(target.documents.get('14ABC:2026-11-11')?.transaction_history).toEqual({
			'stable-id': {
				time: '10:24',
				assembly_line: defaultDepartmentId,
				storage_location: defaultLocationId,
				size_ledger: { '07': { stocked_in_qty: 2 } },
				voided: false
			}
		})
	})

	it.each(['object', 'map'])(
		'reuses legacy IDs from %s history and keeps new IDs on reruns',
		async (representation) => {
			const target = createDatabase()
			const existing = {
				time: ' 10:24 ',
				assembly_line: 'Line A-1',
				storage_location: ' WH A ',
				size_ledger:
					representation === 'map'
						? new Map([
								['08', { stocked_in_qty: 3, total_recall_tx: 0 }],
								['07', { stocked_in_qty: 2 }]
							])
						: { '08': { stocked_in_qty: 3, total_recall_tx: 0 }, '07': { stocked_in_qty: 2 } },
				voided: false
			}
			target.documents.set('14ABC:2026-11-11', {
				mo_no: '14ABC',
				date: '2026-11-11',
				transaction_history:
					representation === 'map' ? new Map([['legacy-random-id', existing]]) : { 'legacy-random-id': existing }
			})
			const transaction = {
				time: '10:24',
				assembly_line: 'LineA1',
				storage_location: 'WH A',
				size_ledger: { '07': { stocked_in_qty: 2 }, '08': { stocked_in_qty: 3 } }
			}
			const source = createPool([
				row({
					transaction_history: JSON.stringify([transaction, { ...transaction, time: '10:25' }])
				})
			])
			const generateId = jest.fn(() => 'SI-261111-001')
			const expectedNewId = 'SI-261111-001'

			for (let run = 0; run < 3; run++) {
				await runDailyMoInventoryLedgerStep(source.pool, target.database, generateId)
				const history = target.documents.get('14ABC:2026-11-11')?.transaction_history as Record<string, unknown>
				expect(Object.keys(history)).toEqual(['legacy-random-id', expectedNewId])
			}
			expect(generateId).toHaveBeenCalledTimes(1)
		}
	)

	it('retains the legacy transaction ID when department and storage ObjectIds resolve', async () => {
		const target = createDatabase()
		const departmentId = new Types.ObjectId()
		const locationId = new Types.ObjectId()
		target.lookupDocuments.get('departments')?.set(departmentId.toHexString(), {
			code: 'GL3BA01',
			name: { cn: '成型A', en: 'Line A-1', vi: 'Chuyền A' }
		})
		target.lookupDocuments
			.get('storage_locations')
			?.set(locationId.toHexString(), { name: 'WH A', storage_num: 'S01' })
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: {
				'legacy-object-id': {
					...JSON.parse(row().transaction_history)[0],
					assembly_line: departmentId,
					storage_location: locationId
				}
			}
		})
		const generateId = jest.fn(() => 'new-id')

		const sourceTransaction = {
			...JSON.parse(row().transaction_history)[0],
			assembly_line: 'GL3BA01',
			storage_location: 'S01'
		}
		await runDailyMoInventoryLedgerStep(
			createPool([row({ transaction_history: JSON.stringify([sourceTransaction]) })]).pool,
			target.database,
			generateId
		)

		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual([
			'legacy-object-id'
		])
		expect(generateId).not.toHaveBeenCalled()
	})

	it('matches ObjectId department references against normalized department codes', async () => {
		const target = createDatabase()
		target.lookupDocuments.get('departments')?.clear()
		const departmentId = new Types.ObjectId()
		target.lookupDocuments.get('departments')?.set(departmentId.toHexString(), {
			code: 'Line A-1',
			name: { cn: '成型甲', en: 'Assembly A', vi: 'Tổ lắp ráp A' }
		})
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: {
				'legacy-code-id': {
					...JSON.parse(row().transaction_history)[0],
					assembly_line: departmentId
				}
			}
		})

		await runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')

		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual([
			'legacy-code-id'
		])
	})

	it.each([
		{ collection: 'departments', field: 'assembly_line' },
		{ collection: 'storage_locations', field: 'storage_location' }
	])('identifies $collection lookup failures while resolving ObjectId references', async ({ collection, field }) => {
		const target = createDatabase()
		const referenceId = new Types.ObjectId()
		const lookupError = new Error(`${collection} lookup failed`)
		target.lookupErrors.set(collection, lookupError)
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: {
				'legacy-id': {
					...JSON.parse(row().transaction_history)[0],
					[field]: referenceId
				}
			}
		})

		await expect(
			runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		).rejects.toThrow(
			`14ABC on 2026-11-11: ${field} ObjectId ${referenceId.toHexString()} (${collection} lookup failed)`
		)
		expect(target.getBulkWrites()).toBe(0)
	})

	it.each([
		{ field: 'assembly_line', reference: new Types.ObjectId() },
		{ field: 'storage_location', reference: new Types.ObjectId() }
	])('fails before bulkWrite when the existing $field ObjectId cannot be resolved', async ({ field, reference }) => {
		const target = createDatabase()
		const transaction = { ...JSON.parse(row().transaction_history)[0], [field]: reference }
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: { 'unresolved-id': transaction }
		})

		await expect(
			runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		).rejects.toThrow(`14ABC on 2026-11-11: ${field} ObjectId ${reference.toHexString()}`)

		expect(target.getBulkWrites()).toBe(0)
	})

	it.each([
		{ time: '10:25' },
		{ assembly_line: 'Other line' },
		{ storage_location: null },
		{ size_ledger: { '07': { stocked_in_qty: 3 } } }
	])('does not reuse IDs when stored transaction fields differ: %o', async (change) => {
		const target = createDatabase()
		const transaction = JSON.parse(row().transaction_history)[0]
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: { 'other-id': { ...transaction, ...change } }
		})
		await runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual(['new-id'])
	})

	it('does not match transactions from a different MO or date', async () => {
		const target = createDatabase()
		target.documents.set('14ABC:2026-11-12', {
			transaction_history: { 'other-id': JSON.parse(row().transaction_history)[0] }
		})
		target.documents.set('14XYZ:2026-11-11', {
			transaction_history: { 'other-mo-id': JSON.parse(row().transaction_history)[0] }
		})
		await runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual(['new-id'])
	})

	it('rejects ambiguous existing signatures instead of silently choosing a legacy ID', async () => {
		const target = createDatabase()
		const transaction = JSON.parse(row().transaction_history)[0]
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: { 'legacy-1': transaction, 'legacy-2': transaction }
		})
		await expect(
			runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		).rejects.toThrow(/duplicate.*signature/i)
		expect(target.getBulkWrites()).toBe(0)
	})

	it('ignores malformed stored entries when matching without weakening source validation', async () => {
		const target = createDatabase()
		target.documents.set('14ABC:2026-11-11', {
			transaction_history: { invalid: null, partial: { time: '10:24' } }
		})
		await runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual(['new-id'])
	})

	it.each([null, [], 'invalid'])('handles non-map stored history safely: %p', async (history) => {
		const target = createDatabase()
		target.documents.set('14ABC:2026-11-11', { transaction_history: history })
		await runDailyMoInventoryLedgerStep(createPool([row()]).pool, target.database, () => 'new-id')
		expect(Object.keys(target.documents.get('14ABC:2026-11-11')?.transaction_history as object)).toEqual(['new-id'])
	})

	it('matches existing IDs using all normalized transaction identity fields', async () => {
		const transaction = {
			time: ' 10:24 ',
			assembly_line: 'Line A-1',
			storage_location: ' WH A ',
			size_ledger: { '08': { stocked_in_qty: 3 }, '07': { stocked_in_qty: 2 } }
		}
		const rows = [
			row({
				transaction_history: JSON.stringify([
					{
						...transaction,
						time: '10:24',
						assembly_line: 'LineA1',
						storage_location: 'WH A',
						size_ledger: { '07': { stocked_in_qty: 2 }, '08': { stocked_in_qty: 3 } }
					}
				])
			}),
			row({ mo_no: '14XYZ', transaction_history: JSON.stringify([transaction]) }),
			row({ date: '2026-11-12', transaction_history: JSON.stringify([transaction]) }),
			...[
				{ time: '10:25' },
				{ assembly_line: 'Line B' },
				{ storage_location: null },
				{ size_ledger: { '08': { stocked_in_qty: 4 }, '07': { stocked_in_qty: 2 } } }
			].map((change) => row({ transaction_history: JSON.stringify([{ ...transaction, ...change }]) }))
		]

		for (const [index, sourceRow] of rows.entries()) {
			const target = createDatabase()
			target.documents.set('14ABC:2026-11-11', { transaction_history: { 'existing-id': transaction } })
			await runDailyMoInventoryLedgerStep(createPool([sourceRow]).pool, target.database, () => 'new-id')
			const stored = target.documents.get(`${sourceRow.mo_no.trim()}:${sourceRow.date}`)
			expect(Object.keys(stored?.transaction_history as object)).toEqual([index === 0 ? 'existing-id' : 'new-id'])
		}
	})
})
