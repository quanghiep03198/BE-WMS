import mongoose from 'mongoose'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import 'reflect-metadata'
import { orderSearchFilter, orderSearchGrams } from './order-search-grams'
import { OrderRepository } from './order.repository'
import { ManufacturingOrderModel, ManufacturingOrderSchema } from './schemas/manufacturing-order.schema'
import { PurchaseOrderModel, PurchaseOrderSchema } from './schemas/purchase-order.schema'

describe('order search n-grams', () => {
	it('generates distinct case-insensitive one, two and three character grams', () => {
		expect(orderSearchGrams('AbAB')).toEqual(['a', 'b', 'ab', 'ba', 'aba', 'bab'])
		expect(orderSearchGrams('')).toEqual([])
		expect(orderSearchGrams('ΟΣ')).toContain('σ')
	})

	it('escapes search metacharacters and requires contiguous matches', () => {
		expect(orderSearchFilter('po', 'A.*', true)).toEqual({
			po: { $regex: 'A\\.\\*', $options: 'i' },
			search_ngrams: { $all: ['a.*'] }
		})
		expect(orderSearchFilter('po', '', true)).toEqual({ po: { $regex: '', $options: 'i' } })
	})
})

const uri = process.env.ORDER_SEARCH_TEST_MONGO_URI
const describeMongo = uri ? describe : describe.skip
describeMongo('order search on local MongoDB', () => {
	const database = `order_search_test_${process.pid}_${Date.now()}`
	let connection: mongoose.Connection
	let mo: ManufacturingOrderModel
	let po: PurchaseOrderModel
	const originalSearchFlag = process.env.ORDER_NGRAM_SEARCH_ENABLED

	beforeAll(async () => {
		const parsed = new URL(uri)
		if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
			throw new Error('ORDER_SEARCH_TEST_MONGO_URI must point to a local MongoDB server')
		}
		connection = await mongoose.createConnection(uri, { dbName: database }).asPromise()
		mo = connection.model('ManufacturingOrder', ManufacturingOrderSchema)
		po = connection.model('PurchaseOrder', PurchaseOrderSchema)
		const orders = Array.from({ length: 20000 }, (_, i) => ({
			mo_no: `MO-${String(i).padStart(6, '0')}`,
			brand_name: 'UGG'
		}))
		await connection.db
			.collection('manufacturing_orders')
			.insertMany([
				...orders,
				{ mo_no: 'MO-a.b', brand_name: 'UGG' },
				{ mo_no: 'MO-ΟΣ', brand_name: 'UGG' },
				{ mo_no: 'MO-abcXXXbcd', brand_name: 'UGG' }
			])
		await connection.db.collection('purchase_orders').insertMany(
			orders.map((order) => ({
				po: order.mo_no.replace('MO-', 'PO-'),
				brand_name: 'UGG',
				order_qty: 1,
				factory_shoes_style: 'style',
				color_sn: 'color',
				shipping_progress: { '1': { order_qty: 1, shipped_out_qty: 0 } }
			}))
		)
		await promisify(execFile)(process.execPath, ['dist/migrations/order-search.cjs'], {
			env: { ...process.env, MONGO_URI: uri, MONGO_DB_NAME: database }
		})
		await Promise.all([mo.createIndexes(), po.createIndexes()])
		process.env.ORDER_NGRAM_SEARCH_ENABLED = 'true'
	}, 120000)

	afterAll(async () => {
		if (originalSearchFlag === undefined) delete process.env.ORDER_NGRAM_SEARCH_ENABLED
		else process.env.ORDER_NGRAM_SEARCH_ENABLED = originalSearchFlag
		if (connection) {
			await connection.dropDatabase()
			await connection.close()
		}
	})

	it('backfills every legacy order and is repeatable', async () => {
		for (const [model, field] of [
			[mo, 'mo_no'],
			[po, 'po']
		] as const) {
			expect(await model.countDocuments({ search_ngrams: { $exists: false } })).toBe(0)
			for await (const doc of model.find().select(`+search_ngrams ${field}`).lean().cursor()) {
				expect(doc.search_ngrams).toEqual(orderSearchGrams(doc[field]))
			}
		}
		await promisify(execFile)(process.execPath, ['dist/migrations/order-search.cjs'], {
			env: { ...process.env, MONGO_URI: uri, MONGO_DB_NAME: database }
		})
	}, 120000)

	it('maintains grams through save, insertMany, updates, upserts and bulk writes', async () => {
		await mo.create({ mo_no: 'Create-ABC' })
		await mo.insertMany([{ mo_no: 'InsertMany-ABC' }])
		await mo.updateOne({ mo_no: 'Create-ABC' }, { $set: { mo_no: 'Updated-XYZ' } })
		await mo.updateOne({ mo_no: 'Upsert-ABC' }, { $set: { brand_name: 'UGG' } }, { upsert: true })
		await mo.bulkWrite([
			{ insertOne: { document: { mo_no: 'Bulk-ABC' } } },
			{ updateOne: { filter: { mo_no: 'Bulk-Upsert' }, update: { $inc: { order_qty: 1 } }, upsert: true } }
		])
		await mo.replaceOne({ mo_no: 'Bulk-ABC' }, { mo_no: 'Replacement-ABC' })
		for (const value of ['InsertMany-ABC', 'Updated-XYZ', 'Upsert-ABC', 'Replacement-ABC', 'Bulk-Upsert']) {
			const doc = await mo.findOne({ mo_no: value }).select('+search_ngrams').lean()
			expect(doc.search_ngrams).toEqual(orderSearchGrams(value))
		}
	})

	it('matches the database case-insensitive substring semantics for Unicode identifiers', async () => {
		const values = ['Σ', 'ς', 'σ', 'İ', 'I', 'ı', 'i', 'k', 'K', 'ß', 'ẞ', 'ſ', 's', '😀']
		await mo.insertMany(values.map((value) => ({ mo_no: `Unicode-${value}` })))
		for (const value of values) {
			const baseline = await mo.find({ mo_no: { $regex: value, $options: 'i' } }).select('mo_no').lean()
			const indexed = await mo
				.find(orderSearchFilter('mo_no', value, true))
				.hint('mo_search_ngrams_idx')
				.select('mo_no')
				.lean()
			expect(indexed.map((doc) => doc.mo_no).sort()).toEqual(baseline.map((doc) => doc.mo_no).sort())
		}
	})

	it('preserves literal substring results and uses indexes under 300ms', async () => {
		const repository = new OrderRepository(null, mo, po)
		expect((await repository.searchManufacturingOrder('a.b')).map((doc) => doc.mo_no)).toEqual(['MO-a.b'])
		expect((await repository.searchManufacturingOrder('Σ')).map((doc) => doc.mo_no)).toContain('MO-ΟΣ')
		expect((await repository.searchManufacturingOrder('abcd')).map((doc) => doc.mo_no)).not.toContain('MO-abcXXXbcd')
		const start = performance.now()
		expect(await repository.searchPurchaseOrder('po-001', true)).toHaveLength(5)
		expect(performance.now() - start).toBeLessThan(300)
		let maxMs = 0
		for (const [model, field, hint, emptyHint] of [
			[mo, 'mo_no', 'mo_search_ngrams_idx', 'idx_mo'],
			[po, 'po', 'po_search_ngrams_idx', 'po_idx']
		] as const) {
			for (const term of ['', '0', '01', '001', '001234']) {
				const filter = {
					...orderSearchFilter(field, term, true),
					...(field === 'po' ? { brand_name: { $exists: true } } : {})
				}
				const query = model
					.find(filter)
					.hint(term ? hint : emptyHint)
					.limit(5)
				if (field === 'mo_no') query.sort({ mo_no: -1 })
				const start = performance.now()
				const explain = await query.explain('executionStats')
				const elapsed = performance.now() - start
				maxMs = Math.max(maxMs, elapsed)
				expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain('IXSCAN')
				expect(elapsed).toBeLessThan(300)
			}
		}
		console.log(`Maximum local explain latency: ${maxMs.toFixed(1)} ms`)
	}, 30000)
})
