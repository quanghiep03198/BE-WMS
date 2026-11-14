import { Types, type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { runDefectiveGoodsStep as runStep, type DefectiveDescriptionDependencies } from '../defective-goods'

jest.mock('file-type/node', () => ({
	fileTypeFromBuffer: jest.fn(async (buffer: Buffer) =>
		buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? { mime: 'image/png' } : undefined
	),
	fileTypeStream: jest.fn()
}))

const services = new WeakMap<mongo.Db, DefectiveDescriptionDependencies>()
function runDefectiveGoodsStep(pool: Parameters<typeof runStep>[0], database: mongo.Db, creatorUsername?: string) {
	return runStep(pool, database, services.get(database), creatorUsername)
}

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
				createIndex: async () => 'idx_defective_goods_source_keyid',
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

	const db = database as unknown as mongo.Db
	services.set(db, {
		files: {
			upload: async () => ({ id: '650000000000000000000099', url: '/files/650000000000000000000099' }),
			syncImageRefs: async () => undefined
		},
		withTransaction: async (operation) => operation({} as never)
	})
	return {
		database: db,
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
							/ORDER\s+BY\s+CASE\s+WHEN\s+ri_cancel\s*=\s*1\s+OR\s+UPPER\s*\(\s*isactive\s*\)\s+LIKE\s+'%N%'\s+THEN\s+0\s+ELSE\s+1\s+END\s*,\s*keyid/i.test(
								sql
							)
						) {
							ordered.sort((a, b) => {
								const deleted = (row: typeof a) =>
									Number(row.ri_cancel) === 1 || String(row.isactive).trim().toUpperCase() === 'N'
								return Number(deleted(b)) - Number(deleted(a)) || a.keyid - b.keyid
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
		keyid: 42,
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
	it('imports without sync_id and reuses the generated Mongo id for the same source keyid', async () => {
		const { database, documents } = memoryDatabase(references())
		const row = defectiveGoodsRow()
		const { pool, queries } = memoryPool([{ ...row, keyid: 42 }])
		await runDefectiveGoodsStep(pool, database)
		const first = documents('defective_goods')[0]
		expect(first._id).toBeInstanceOf(Types.ObjectId)
		expect(first).toMatchObject({ source_keyid: 42 })
		await runDefectiveGoodsStep(memoryPool([{ ...row, keyid: 42 }]).pool, database)
		expect(documents('defective_goods')).toHaveLength(1)
		expect(documents('defective_goods')[0]._id).toEqual(first._id)
		expect(queries[0]).not.toMatch(/\bsync_id\b/i)
	})

	it('decodes and sanitizes compressed descriptions before writing', async () => {
		const { database, documents } = memoryDatabase(references())
		const description = gzipSync('<p>Hello<script>alert(1)</script></p>').toString('base64')
		const { pool } = memoryPool([defectiveGoodsRow({ defective_description: description })])

		await runDefectiveGoodsStep(pool, database)

		expect(documents('defective_goods')[0]).toMatchObject({
			defective_description: '<p>Hello</p>',
			description_image_ids: []
		})
	})

	it('extracts repeated embedded images once and preserves them on reruns', async () => {
		const { database, documents } = memoryDatabase(references())
		const dependencies = services.get(database)
		const upload = jest.spyOn(dependencies.files, 'upload')
		const syncRefs = jest.spyOn(dependencies.files, 'syncImageRefs')
		const image = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64')
		const html = `<p>Hi<img src="data:image/png;base64,${image}"><img src="data:image/png;base64,${image}"></p>`
		const source = gzipSync(html).toString('base64')
		for (let run = 0; run < 2; run++) {
			await runDefectiveGoodsStep(memoryPool([defectiveGoodsRow({ defective_description: source })]).pool, database)
		}
		expect(upload).toHaveBeenCalledTimes(1)
		expect(upload.mock.calls[0][1]).toEqual(new Types.ObjectId('650000000000000000000011'))
		expect(syncRefs).toHaveBeenCalledTimes(1)
		expect(syncRefs.mock.calls[0].slice(0, 3)).toEqual([
			`defective-goods:${documents('defective_goods')[0]._id}`,
			[],
			['650000000000000000000099']
		])
		expect(documents('defective_goods')[0]).toMatchObject({
			defective_description:
				'<p>Hi<img src="/files/650000000000000000000099" /><img src="/files/650000000000000000000099" /></p>',
			description_image_ids: ['650000000000000000000099']
		})
	})

	it('preserves application edits when the legacy source has not changed', async () => {
		const { database, documents } = memoryDatabase(references())
		const row = defectiveGoodsRow()
		await runDefectiveGoodsStep(memoryPool([row]).pool, database)
		await database
			.collection('defective_goods')
			.updateOne({ _id: documents('defective_goods')[0]._id }, { $set: { defective_description: '<p>edited</p>' } })
		await runDefectiveGoodsStep(memoryPool([row]).pool, database)
		expect(documents('defective_goods')[0].defective_description).toBe('<p>edited</p>')
	})

	it('updates image references when the source description changes', async () => {
		const oldId = '650000000000000000000088'
		const { database, documents } = memoryDatabase({
			...references(),
			defective_goods: [
				{
					_id: new Types.ObjectId('650000000000000000000001'),
					source_keyid: 42,
					defective_description: `<img src="/files/${oldId}">`,
					description_image_ids: [oldId],
					description_legacy_hash: 'old'
				}
			]
		})
		const syncRefs = jest.spyOn(services.get(database).files, 'syncImageRefs')
		await runDefectiveGoodsStep(
			memoryPool([defectiveGoodsRow({ defective_description: '<p>new</p>' })]).pool,
			database
		)
		expect(syncRefs.mock.calls[0].slice(0, 3)).toEqual(['defective-goods:650000000000000000000001', [oldId], []])
		expect(documents('defective_goods')[0]).toMatchObject({
			defective_description: '<p>new</p>',
			description_image_ids: []
		})
	})

	it('accepts gzip buffers without changing the source bytes used for the hash', async () => {
		const { database, documents } = memoryDatabase(references())
		const description = gzipSync('<p>buffer</p>')
		await runDefectiveGoodsStep(
			memoryPool([defectiveGoodsRow({ defective_description: description })]).pool,
			database
		)
		expect(documents('defective_goods')[0]).toMatchObject({
			defective_description: '<p>buffer</p>',
			description_image_ids: []
		})
	})

	it('does not write the document if updating image references fails', async () => {
		const { database, writes } = memoryDatabase(references())
		jest.spyOn(services.get(database).files, 'syncImageRefs').mockRejectedValue(new Error('reference failed'))
		await expect(runDefectiveGoodsStep(memoryPool([defectiveGoodsRow()]).pool, database)).rejects.toThrow(
			'reference failed'
		)
		expect(writes).toHaveLength(0)
	})

	it.each([
		{ defective_description: '<img src="data:image/png;base64,invalid">' },
		{ defective_description: `<img src="data:image/png;base64,${Buffer.from('not an image').toString('base64')}">` },
		{
			defective_description: `<img src="data:image/png;base64,${Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')}">`,
			user_code_created: null
		}
	])('fails without writing for an invalid embedded image or missing owner', async (overrides) => {
		const { database, writes } = memoryDatabase(references())
		await expect(runDefectiveGoodsStep(memoryPool([defectiveGoodsRow(overrides)]).pool, database)).rejects.toThrow()
		expect(writes).toHaveLength(0)
	})

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
			_id: expect.any(Types.ObjectId),
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

	it.each([
		{
			user_code_created: '1105030',
			user_code_updated: 'updater',
			created: null,
			updated: '650000000000000000000012'
		},
		{
			user_code_created: 'creator',
			user_code_updated: 'unknown',
			created: '650000000000000000000011',
			updated: null
		},
		{ user_code_created: null, user_code_updated: null, created: null, updated: null }
	])('sets missing user references to null while resolving each source independently', async (entry) => {
		const { database, documents } = memoryDatabase(references())
		await runDefectiveGoodsStep(
			memoryPool([
				defectiveGoodsRow({
					user_code_created: entry.user_code_created,
					user_code_updated: entry.user_code_updated
				})
			]).pool,
			database
		)
		expect(documents('defective_goods')[0]).toMatchObject({
			created_by: entry.created ? new Types.ObjectId(entry.created) : null,
			updated_by: entry.updated ? new Types.ObjectId(entry.updated) : null
		})
	})

	it('uses the configured fallback owner for embedded images without assigning created_by', async () => {
		const { database, documents } = memoryDatabase(references())
		const upload = jest.spyOn(services.get(database).files, 'upload')
		const image = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64')
		await runDefectiveGoodsStep(
			memoryPool([
				defectiveGoodsRow({
					user_code_created: '1105030',
					defective_description: `<img src="data:image/png;base64,${image}">`
				})
			]).pool,
			database,
			'updater'
		)
		expect(documents('defective_goods')[0].created_by).toBeNull()
		expect(upload.mock.calls[0][1]).toEqual(new Types.ObjectId('650000000000000000000012'))
	})

	it('fails explicitly when an embedded image needs a missing fallback owner', async () => {
		const { database, writes } = memoryDatabase(references())
		const image = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64')
		await expect(
			runDefectiveGoodsStep(
				memoryPool([
					defectiveGoodsRow({
						user_code_created: 'unknown',
						defective_description: `<img src="data:image/png;base64,${image}">`
					})
				]).pool,
				database,
				'missing-fallback'
			)
		).rejects.toThrow('missing-fallback')
		expect(writes).toHaveLength(0)
	})

	it('matches department names contained in SQL line names for both fields', async () => {
		const { database, documents } = memoryDatabase({
			...references(),
			departments: [
				{ _id: new Types.ObjectId('650000000000000000000021'), name: { cn: '成型A' } },
				{ _id: new Types.ObjectId('650000000000000000000022'), name: { cn: '針車1' } }
			]
		})
		await runDefectiveGoodsStep(
			memoryPool([defectiveGoodsRow({ assembly_line: '二廠成型A線', sewing_line: '針車1組' })]).pool,
			database
		)
		expect(documents('defective_goods')[0]).toMatchObject({
			assembly_line: new Types.ObjectId('650000000000000000000021'),
			sewing_line: new Types.ObjectId('650000000000000000000022')
		})
	})

	it('does not match a shorter numeric line as a prefix of a different line', async () => {
		const { database, writes } = memoryDatabase({
			...references(),
			departments: [
				{ _id: new Types.ObjectId('650000000000000000000021'), name: { cn: 'Assembly A' } },
				{ _id: new Types.ObjectId('650000000000000000000022'), name: { cn: '針車1' } }
			]
		})
		await expect(
			runDefectiveGoodsStep(memoryPool([defectiveGoodsRow({ sewing_line: '針車10組' })]).pool, database)
		).rejects.toThrow('Unresolved defective goods sewing_line 針車10組')
		expect(writes).toHaveLength(0)
	})

	it('treats regex characters in department names literally', async () => {
		const { database, documents } = memoryDatabase({
			...references(),
			departments: [
				{ _id: new Types.ObjectId('650000000000000000000021'), name: { cn: 'Assembly A' } },
				{ _id: new Types.ObjectId('650000000000000000000022'), name: { cn: 'Line [1]' } },
				{ _id: new Types.ObjectId('650000000000000000000020'), name: { cn: 'Line 1' } }
			]
		})
		await runDefectiveGoodsStep(
			memoryPool([defectiveGoodsRow({ sewing_line: 'Dept Line [1] Group' })]).pool,
			database
		)
		expect(documents('defective_goods')[0].sewing_line).toEqual(new Types.ObjectId('650000000000000000000022'))
	})

	it('prefers the longest matching department name and warns when matches are ambiguous', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			const { database, documents } = memoryDatabase({
				...references(),
				departments: [
					{ _id: new Types.ObjectId('650000000000000000000021'), name: { cn: 'Assembly A' } },
					{ _id: new Types.ObjectId('650000000000000000000020'), name: { cn: '針車' } },
					{ _id: new Types.ObjectId('650000000000000000000022'), name: { cn: '針車1' } }
				]
			})
			await runDefectiveGoodsStep(memoryPool([defectiveGoodsRow({ sewing_line: '針車1組' })]).pool, database)
			expect(documents('defective_goods')[0].sewing_line).toEqual(new Types.ObjectId('650000000000000000000022'))
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ambiguous defective goods department 針車1組'))
		} finally {
			warn.mockRestore()
		}
	})

	it('chooses the lowest ObjectId by Chinese name regardless of group or input order', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			for (const reverse of [false, true]) {
				const departments = [
					{ _id: new Types.ObjectId('650000000000000000000032'), group: 'ASBL', name: { cn: 'Shared' } },
					{ _id: new Types.ObjectId('650000000000000000000031'), group: 'ASBL', name: { cn: 'Shared' } },
					{ _id: new Types.ObjectId('650000000000000000000033'), group: 'SEW', name: { cn: 'Shared' } },
					{ _id: new Types.ObjectId('650000000000000000000030'), name: { cn: 'Shared' } }
				]
				if (reverse) departments.reverse()
				const { database, documents } = memoryDatabase({ ...references(), departments })
				await runDefectiveGoodsStep(
					memoryPool([defectiveGoodsRow({ assembly_line: 'Shared', sewing_line: 'Shared' })]).pool,
					database
				)
				expect(documents('defective_goods')[0]).toMatchObject({
					assembly_line: new Types.ObjectId('650000000000000000000030'),
					sewing_line: new Types.ObjectId('650000000000000000000030')
				})
			}
			expect(warn).toHaveBeenCalled()
		} finally {
			warn.mockRestore()
		}
	})

	it('does not overwrite existing lines or add them on inserts when the source is null', async () => {
		const id = new Types.ObjectId('650000000000000000000001')
		const assembly = new Types.ObjectId('650000000000000000000021')
		const sewing = new Types.ObjectId('650000000000000000000022')
		for (const existing of [true, false]) {
			const { database, documents, writes } = memoryDatabase({
				...references(),
				defective_goods: existing
					? [{ _id: id, source_keyid: 42, assembly_line: assembly, sewing_line: sewing }]
					: []
			})
			await runDefectiveGoodsStep(
				memoryPool([defectiveGoodsRow({ assembly_line: null, sewing_line: null })]).pool,
				database
			)
			expect(writes[0].update.$set).not.toHaveProperty('assembly_line')
			expect(writes[0].update.$set).not.toHaveProperty('sewing_line')
			if (existing)
				expect(documents('defective_goods')[0]).toMatchObject({ assembly_line: assembly, sewing_line: sewing })
			else {
				expect(documents('defective_goods')[0]).not.toHaveProperty('assembly_line')
				expect(documents('defective_goods')[0]).not.toHaveProperty('sewing_line')
			}
		}
	})

	it('continues to reject non-null unmatched department names before writing', async () => {
		const { database, writes } = memoryDatabase(references())
		await expect(
			runDefectiveGoodsStep(memoryPool([defectiveGoodsRow({ sewing_line: 'Unknown' })]).pool, database)
		).rejects.toThrow('Unresolved defective goods sewing_line Unknown')
		expect(writes).toHaveLength(0)
	})

	it('preserves deleted state from the legacy source flags', async () => {
		const { database, documents } = memoryDatabase(references())
		const { pool } = memoryPool([defectiveGoodsRow({ ri_cancel: 1, isactive: 'N' })])

		await runDefectiveGoodsStep(pool, database)

		expect(documents('defective_goods')[0]).toMatchObject({ deleted: true })
		expect(documents('defective_goods')[0].deleted_at).toBeInstanceOf(Date)
	})

	it('restores by source keyid and updates the same document on repeat runs', async () => {
		const id = new Types.ObjectId('650000000000000000000001')
		const { database, documents, writes } = memoryDatabase({
			...references(),
			defective_goods: [{ _id: id, source_keyid: 42, epc: 'old-epc', deleted: true }]
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
		const epc = '123456789012345678901234'
		const { database, documents, writes } = memoryDatabase({
			...references(),
			defective_goods: [{ _id: oldId, source_keyid: 1, epc, deleted: false }]
		})
		const rows = [defectiveGoodsRow({ keyid: 2, epc }), defectiveGoodsRow({ keyid: 1, epc, ...flags })]

		for (let run = 0; run < 2; run++) {
			const { pool } = orderingPool(rows)
			expect(await runDefectiveGoodsStep(pool, database)).toEqual({ defectiveGoods: 2 })
		}

		const replacementId = documents('defective_goods').find((document) => document.source_keyid === 2)?._id
		expect(replacementId).toBeInstanceOf(Types.ObjectId)
		expect(writes.map(({ filter }) => filter._id)).toEqual([oldId, replacementId, oldId, replacementId])
		expect(documents('defective_goods')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ _id: oldId, epc, deleted: true }),
				expect.objectContaining({ _id: replacementId, epc, deleted: false })
			])
		)
		expect(documents('defective_goods')).toHaveLength(2)
	})

	it('rejects invalid source enums and keyids instead of writing them', async () => {
		for (const overrides of [{ defective_category: 'UNKNOWN' }, { keyid: 'bad' }, { epc: 'short' }]) {
			const { database, writes } = memoryDatabase(references())
			const { pool } = memoryPool([defectiveGoodsRow(overrides)])

			await expect(runDefectiveGoodsStep(pool, database)).rejects.toThrow()
			expect(writes).toHaveLength(0)
		}
	})
})
