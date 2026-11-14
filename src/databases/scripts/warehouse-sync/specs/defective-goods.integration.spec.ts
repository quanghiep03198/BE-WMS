import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { runDefectiveGoodsStep } from '../defective-goods'

jest.mock('file-type/node', () => ({
	fileTypeFromBuffer: jest.fn(async () => ({ mime: 'image/png' })),
	fileTypeStream: jest.fn(async (stream: Readable) => Object.assign(stream, { fileType: { mime: 'image/png' } }))
}))

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('defective goods description GridFS integration', () => {
	it('stores images and reference metadata, reuses them, and releases old references on change', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const owner = new mongoose.Types.ObjectId()
			await database.collection('users').insertOne({ _id: owner, username: 'fallback' })
			const image = Buffer.from('89504e470d0a1a0a00000000', 'hex')
			let description = gzipSync(
				`<p>Photo<img src="data:image/png;base64,${image.toString('base64')}"></p>`
			).toString('base64')
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from([
							{
								keyid: 42,
								epc: '123456789012345678901234',
								ri_type: 'uhf',
								unit: 'prs',
								mo_no: null,
								po: null,
								brand_name: null,
								factory_shoes_style: 'STYLE',
								cust_shoes_style: 'CUST',
								color_sn: 'BLACK',
								size_code: '42',
								defective_category: 'B',
								defective_location: 'A',
								defective_description: description,
								shoe_source: 'A',
								assembly_line: null,
								sewing_line: null,
								storage_location: null,
								inbound_date: null,
								outbound_date: null,
								outbound_purpose: null,
								ri_cancel: 0,
								isactive: 'Y',
								user_code_created: null,
								user_code_updated: null
							}
						]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			await runDefectiveGoodsStep(pool, database, undefined, 'fallback')
			const first = await database.collection('defective_goods').findOne({ source_keyid: 42 })
			expect(first.created_by).toBeNull()
			const id = first._id
			expect(id).toBeInstanceOf(mongoose.Types.ObjectId)
			expect(first.description_image_ids).toHaveLength(1)
			const fileId = first.description_image_ids[0]
			expect(first.defective_description).toContain(`/files/${fileId}`)
			const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'images' })
			const chunks: Buffer[] = []
			for await (const chunk of bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId)))
				chunks.push(chunk as Buffer)
			expect(Buffer.concat(chunks)).toEqual(image)
			expect(
				await database.collection('stored_files').findOne({ gridfs_id: new mongoose.Types.ObjectId(fileId) })
			).toMatchObject({ owner_id: owner, status: 'attached', refs: [`defective-goods:${id}`] })
			await runDefectiveGoodsStep(pool, database, undefined, 'fallback')
			expect(await database.collection('images.files').countDocuments()).toBe(1)
			expect(await database.collection('defective_goods').countDocuments({ source_keyid: 42 })).toBe(1)
			expect((await database.collection('defective_goods').findOne({ source_keyid: 42 }))._id).toEqual(id)
			description = '<p>new</p>'
			await runDefectiveGoodsStep(pool, database, undefined, 'fallback')
			expect(await database.collection('defective_goods').findOne({ _id: id })).toMatchObject({
				defective_description: '<p>new</p>',
				description_image_ids: []
			})
			expect(
				await database.collection('stored_files').findOne({ gridfs_id: new mongoose.Types.ObjectId(fileId) })
			).toMatchObject({ refs: [], orphaned_at: expect.any(Date) })
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
