import { Types, type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runDefectiveGoodsStep } from '../defective-goods'

type Document = Record<string, unknown> & { _id?: Types.ObjectId }

function memoryDatabase(seed: Record<string, Document[]> = {}) {
	const collections = new Map<string, Map<string, Document>>()
	const writes: Array<{ collection: string; filter: Document; update: Document; options: Document }> = []

	for (const [name, documents] of Object.entries(seed)) {
		collections.set(name, new Map(documents.map((document) => [String(document._id), { ...document }])))
	}

	const database = {
		collection(name: string) {
			let documents = collections.get(name)
			if (!documents) {
				documents = new Map()
				collections.set(name, documents)
			}
			return {
				find: () => ({ toArray: async () => [...documents.values()] }),
				findOne: async (filter: Document) =>
					[...documents.values()].find((document) =>
						Object.entries(filter).every(([key, value]) => {
							if (key === '_id') return String(document._id) === String(value)
							if (key.includes('.')) {
								const [parent, child] = key.split('.')
								return (document[parent] as Document | undefined)?.[child] === value
							}
							return document[key] === value
						})
					) ?? null,
				updateOne: async (filter: Document, update: Document, options: Document) => {
					writes.push({ collection: name, filter, update, options })
					const key = String(filter._id)
					const existing = documents.get(key)
					const next = existing ? { ...existing } : { _id: filter._id, ...(update.$setOnInsert as Document) }
					Object.assign(next, update.$set)
					if (
						name === 'defective_goods' &&
						next.deleted === false &&
						[...documents.entries()].some(
							([otherKey, document]) =>
								otherKey !== key && document.deleted === false && document.epc === next.epc
						)
					) {
						throw new Error('Duplicate active EPC')
					}
					documents.set(key, next)
					return { acknowledged: true, upsertedCount: existing ? 0 : 1, matchedCount: existing ? 1 : 0 }
				}
			}
		}
	}

	return {
		database: database as unknown as mongo.Db,
		documents: (name: string) => [...(collections.get(name)?.values() ?? [])],
		writes
	}
}

function memoryPool(rows: unknown[]) {
	const queries: string[] = []
	const pool = {
		request: () => ({
			input: () => undefined,
			toReadableStream: () => Readable.from(rows),
			query: async (sql: string) => {
				queries.push(sql)
			},
			cancel: () => true
		})
	}
	return { pool, queries }
}

function orderingPool(rows: ReturnType<typeof defectiveGoodsRow>[]) {
	let sql = ''
	const pool = {
		request: () => ({
			input: () => undefined,
			toReadableStream: () =>
				Readable.from(
					(async function* () {
						const ordered = [...rows]
						if (
							/ORDER\s+BY\s+CASE\s+WHEN\s+ri_cancel\s*=\s*1\s+OR\s+UPPER\s*\(\s*isactive\s*\)\s+LIKE\s+'%N%'\s+THEN\s+0\s+ELSE\s+1\s+END\s*,\s*sync_id/i.test(
								sql
							)
						) {
							ordered.sort((a, b) => {
								const deleted = (row: typeof a) =>
									Number(row.ri_cancel) === 1 || String(row.isactive).trim().toUpperCase() === 'N'
								return (
									Number(deleted(b)) - Number(deleted(a)) || String(a.sync_id).localeCompare(String(b.sync_id))
								)
							})
						}
						yield* ordered
					})()
				),
			query: async (query: string) => {
				sql = query
			},
			cancel: () => true
		})
	}
	return { pool }
}

function defectiveGoodsRow(overrides: Record<string, unknown> = {}) {
	return {
		sync_id: '650000000000000000000001',
		epc: '123456789012345678901234',
		ri_type: 'uhf',
		unit: 'prs',
		mo_no: 'MO-01',
		po: 'PO-01',
		brand_name: 'brand',
		factory_shoes_style: 'STYLE-01',
		cust_shoes_style: 'CUST-01',
		color_sn: 'BLACK',
		size_code: '42',
		defective_category: 'B',
		defective_location: 'A',
		defective_description: 'Defective shoe',
		shoe_source: 'A',
		assembly_line: 'Assembly A',
		sewing_line: 'Sewing A',
		storage_location: 'RACK-01',
		inbound_date: new Date('2026-01-02T03:04:05.000Z'),
		outbound_date: null,
		outbound_purpose: null,
		ri_cancel: 0,
		isactive: 'Y',
		user_code_created: 'creator',
		user_code_updated: 'updater',
		...overrides
	}
}

function references() {
	return {
		users: [
			{ _id: new Types.ObjectId('650000000000000000000011'), username: 'creator' },
			{ _id: new Types.ObjectId('650000000000000000000012'), username: 'updater' }
		],
		departments: [
			{
				_id: new Types.ObjectId('650000000000000000000021'),
				group: 'ASBL',
				name: { cn: 'Assembly A' }
			},
			{
				_id: new Types.ObjectId('650000000000000000000022'),
				group: 'SEW',
				name: { cn: 'Sewing A' }
			}
		]
	}
}

describe('runDefectiveGoodsStep', () => {
	it('validates required fields before writing a source row', async () => {
		const { database, writes } = memoryDatabase(references())
		const { pool } = memoryPool([defectiveGoodsRow({ factory_shoes_style: ' ' })])

		await expect(runDefectiveGoodsStep(pool, database)).rejects.toThrow()
		expect(writes).toHaveLength(0)
	})

	it('maps source columns and enum values to the defective-goods schema', async () => {
		const { database, documents } = memoryDatabase(references())
		const { pool, queries } = memoryPool([defectiveGoodsRow()])

		expect(await runDefectiveGoodsStep(pool, database)).toEqual({ defectiveGoods: 1 })

		expect(queries).toHaveLength(1)
		expect(queries[0]).toMatch(/^\s*SELECT\b/i)
		expect(queries[0]).toContain('DV_DATA_LAKE.dbo.dv_defective_goods')
		expect(queries[0]).not.toMatch(/\b(?:MERGE|INSERT|UPDATE|DELETE)\b/i)
		expect(documents('defective_goods')[0]).toMatchObject({
			_id: new Types.ObjectId('650000000000000000000001'),
			epc: '123456789012345678901234',
			combination_strategy: 'uhf',
			unit: 'prs',
			size_numcode: '42',
			shoe_source: 'A',
			inbound_at: new Date('2026-01-02T03:04:05.000Z'),
			outbound_at: null
		})
	})

	it('maps source user and department references to Mongo ObjectIds', async () => {
		const { database, documents } = memoryDatabase(references())
		const { pool } = memoryPool([defectiveGoodsRow()])

		await runDefectiveGoodsStep(pool, database)

		expect(documents('defective_goods')[0]).toMatchObject({
			created_by: new Types.ObjectId('650000000000000000000011'),
			updated_by: new Types.ObjectId('650000000000000000000012'),
			assembly_line: new Types.ObjectId('650000000000000000000021'),
			sewing_line: new Types.ObjectId('650000000000000000000022')
		})
	})

	it('preserves deleted state from the legacy source flags', async () => {
		const { database, documents } = memoryDatabase(references())
		const { pool } = memoryPool([defectiveGoodsRow({ ri_cancel: 1, isactive: 'N' })])

		await runDefectiveGoodsStep(pool, database)

		expect(documents('defective_goods')[0]).toMatchObject({ deleted: true })
		expect(documents('defective_goods')[0].deleted_at).toBeInstanceOf(Date)
	})

	it('restores by sync_id and updates the same document on repeat runs', async () => {
		const id = new Types.ObjectId('650000000000000000000001')
		const { database, documents, writes } = memoryDatabase({
			...references(),
			defective_goods: [{ _id: id, epc: 'old-epc', deleted: true }]
		})
		const row = defectiveGoodsRow()

		for (let run = 0; run < 2; run++) {
			const { pool } = memoryPool([row])
			expect(await runDefectiveGoodsStep(pool, database)).toEqual({ defectiveGoods: 1 })
		}

		expect(documents('defective_goods')).toHaveLength(1)
		expect(documents('defective_goods')[0]._id).toEqual(id)
		expect(writes.map(({ filter }) => filter)).toEqual([{ _id: id }, { _id: id }])
		expect(writes.every(({ options }) => options.upsert === true)).toBe(true)
	})

	it.each([
		{ ri_cancel: 1, isactive: 'Y' },
		{ ri_cancel: 0, isactive: ' \tn\t ' }
	])('deletes the previous owner before importing a reused EPC with flags %o', async (flags) => {
		const oldId = new Types.ObjectId('650000000000000000000001')
		const replacementId = new Types.ObjectId('650000000000000000000002')
		const epc = '123456789012345678901234'
		const { database, documents, writes } = memoryDatabase({
			...references(),
			defective_goods: [{ _id: oldId, epc, deleted: false }]
		})
		const rows = [
			defectiveGoodsRow({ sync_id: replacementId.toHexString(), epc }),
			defectiveGoodsRow({ sync_id: oldId.toHexString(), epc, ...flags })
		]

		for (let run = 0; run < 2; run++) {
			const { pool } = orderingPool(rows)
			expect(await runDefectiveGoodsStep(pool, database)).toEqual({ defectiveGoods: 2 })
		}

		expect(writes.map(({ filter }) => filter._id)).toEqual([oldId, replacementId, oldId, replacementId])
		expect(documents('defective_goods')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ _id: oldId, epc, deleted: true }),
				expect.objectContaining({ _id: replacementId, epc, deleted: false })
			])
		)
		expect(documents('defective_goods')).toHaveLength(2)
	})

	it('rejects invalid source enums and ObjectIds instead of writing them', async () => {
		for (const overrides of [{ defective_category: 'UNKNOWN' }, { sync_id: 'not-an-object-id' }, { epc: 'short' }]) {
			const { database, writes } = memoryDatabase(references())
			const { pool } = memoryPool([defectiveGoodsRow(overrides)])

			await expect(runDefectiveGoodsStep(pool, database)).rejects.toThrow()
			expect(writes).toHaveLength(0)
		}
	})
})
