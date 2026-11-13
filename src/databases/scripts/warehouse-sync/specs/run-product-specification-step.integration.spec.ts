import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runProductSpecificationStep } from '../run-product-specification-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runProductSpecificationStep', () => {
	it('merges source colors and sizes and preserves the document ID when rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const rows = [
				{
					brand_name: 'UGG',
					factory_shoes_style: 'F1',
					cust_shoes_style: 'C1',
					product_variants: JSON.stringify([{ color_sn: 'BLACK', sizes: [{ size_numcode: '7' }] }])
				},
				{
					brand_name: 'UGG',
					factory_shoes_style: 'F1',
					cust_shoes_style: 'C1',
					product_variants: JSON.stringify([
						{ color_sn: 'BLACK', sizes: [{ size_numcode: '7' }, { size_numcode: '8' }] },
						{ color_sn: 'WHITE', sizes: [{ size_numcode: '9' }] },
						{ color_sn: 'YELLOW', sizes: [] }
					])
				}
			]
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () => Readable.from(rows),
					query: async () => undefined,
					cancel: () => true
				})
			}
			expect(await runProductSpecificationStep(pool, database)).toEqual({ productSpecifications: 1 })
			const collection = database.collection('product_specifications')
			const first = await collection.findOne({ factory_shoes_style: 'F1' })
			expect(first.product_variants).toEqual([
				{ color_sn: 'BLACK', sizes: ['7', '8'] },
				{ color_sn: 'WHITE', sizes: ['9'] },
				{ color_sn: 'YELLOW', sizes: [] }
			])
			expect(await runProductSpecificationStep(pool, database)).toEqual({ productSpecifications: 1 })
			expect(await collection.countDocuments()).toBe(1)
			expect((await collection.findOne({ factory_shoes_style: 'F1' }))._id).toEqual(first._id)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('rejects malformed source variants without writing incomplete specifications', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from([
							{
								brand_name: 'UGG',
								factory_shoes_style: 'F1',
								cust_shoes_style: 'C1',
								product_variants: JSON.stringify([{ color_sn: 'BLACK', sizes: [{ size_numcode: null }] }])
							}
						]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			await expect(runProductSpecificationStep(pool, database)).rejects.toThrow(
				'Invalid product specification size_numcode'
			)
			expect(await database.collection('product_specifications').countDocuments()).toBe(0)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
