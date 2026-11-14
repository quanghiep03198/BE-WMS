import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runTruckloadDeliveryStep } from '../truckload-delivery'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('truckload delivery signatures in GridFS', () => {
	it('stores downloadable signatures and reuses their ids on a second sync', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const userId = new mongoose.Types.ObjectId()
			await database.collection('users').insertOne({ _id: userId, username: '1009006' })
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from([
							{
								dispatch_order: 'DO-1',
								created_by: userId.toString(),
								packing: '[]',
								ie_signature: 'data:image/jpeg;base64,aWU=',
								warehouse_officer_signature: 'd2FyZWhvdXNl',
								security_1_signature: '',
								security_2_signature: null
							}
						]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			await runTruckloadDeliveryStep(pool, database)
			const first = await database.collection('truckload_delivery').findOne({ dispatch_order: 'DO-1' })
			expect(first.ie_signature).toBeInstanceOf(mongoose.Types.ObjectId)
			expect(first.warehouse_officer_signature).toBeInstanceOf(mongoose.Types.ObjectId)
			expect(first.security_1_signature).toBeNull()
			expect(first.security_2_signature).toBeNull()
			const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'dispatch_order_signatures' })
			const chunks: Buffer[] = []
			for await (const chunk of bucket.openDownloadStream(first.ie_signature)) chunks.push(chunk as Buffer)
			expect(Buffer.concat(chunks).toString()).toBe('ie')
			expect((await bucket.find({ _id: first.ie_signature }).toArray())[0].metadata.contentType).toBe('image/jpeg')

			await runTruckloadDeliveryStep(pool, database)
			const second = await database.collection('truckload_delivery').findOne({ dispatch_order: 'DO-1' })
			expect(second.ie_signature).toEqual(first.ie_signature)
			expect(second.warehouse_officer_signature).toEqual(first.warehouse_officer_signature)
			expect(await database.collection('dispatch_order_signatures.files').countDocuments()).toBe(2)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
