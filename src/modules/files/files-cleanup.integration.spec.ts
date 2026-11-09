import { ConfigService } from '@nestjs/config'
import mongoose, { Connection, Model, Types } from 'mongoose'
import { FilesCleanupProcessor } from './files-cleanup.service'
import { StoredFile, StoredFileSchema } from './stored-file.schema'

const mongoUri = process.env.FILES_TEST_MONGO_URI
const integration = mongoUri ? describe : describe.skip

integration('FilesCleanupProcessor integration', () => {
	let connection: Connection
	let files: Model<StoredFile>
	const ids = Array.from({ length: 6 }, () => new Types.ObjectId())
	const owner = new Types.ObjectId()

	beforeAll(async () => {
		connection = await mongoose.createConnection(mongoUri, { dbName: 'files_cleanup_integration' }).asPromise()
		files = connection.model(StoredFile.name, StoredFileSchema)
		const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
		await files.insertMany([
			{ gridfs_id: ids[0], owner_id: owner, mimetype: 'image/png', size: 1, status: 'pending', created_at: old },
			{ gridfs_id: ids[1], owner_id: owner, mimetype: 'image/png', size: 1, status: 'attached', orphaned_at: old },
			{ gridfs_id: ids[2], owner_id: owner, mimetype: 'image/png', size: 1, status: 'pending' },
			{
				gridfs_id: ids[3],
				owner_id: owner,
				mimetype: 'image/png',
				size: 1,
				status: 'attached',
				refs: [`defective-goods:${owner}`]
			},
			{
				gridfs_id: ids[4],
				owner_id: owner,
				mimetype: 'image/png',
				size: 1,
				status: 'attached',
				refs: [`defective-goods:${new Types.ObjectId()}`]
			},
			{
				gridfs_id: ids[5],
				owner_id: owner,
				mimetype: 'image/png',
				size: 1,
				status: 'pending',
				created_at: old,
				cleanup_started_at: old
			}
		])
		await connection.db
			.collection('defective_goods')
			.insertOne({ _id: owner, description_image_ids: [ids[3].toString()] })
		for (const id of ids) {
			if (!id.equals(ids[5])) await connection.db.collection('images.files').insertOne({ _id: id })
			await connection.db.collection('images.chunks').insertOne({ files_id: id, n: 0 })
		}
	})

	afterAll(async () => {
		await files.deleteMany({ gridfs_id: { $in: ids } })
		await connection.db.collection('images.files').deleteMany({ _id: { $in: ids } })
		await connection.db.collection('images.chunks').deleteMany({ files_id: { $in: ids } })
		await connection.db.collection('defective_goods').deleteOne({ _id: owner })
		await connection.close()
	})

	it('deletes only eligible images and chunks and is idempotent', async () => {
		const processor = new FilesCleanupProcessor(connection, files, new ConfigService())
		await processor.process()
		await processor.process()
		expect(await files.countDocuments({ gridfs_id: { $in: ids.slice(0, 2) } })).toBe(0)
		expect(await files.countDocuments({ gridfs_id: { $in: ids.slice(2, 5) } })).toBe(3)
		expect(await files.countDocuments({ gridfs_id: ids[5] })).toBe(0)
		expect(
			await connection.db.collection('images.chunks').countDocuments({ files_id: { $in: ids.slice(0, 2) } })
		).toBe(0)
		expect(
			await connection.db.collection('images.chunks').countDocuments({ files_id: { $in: ids.slice(2, 5) } })
		).toBe(3)
		expect(await connection.db.collection('images.chunks').countDocuments({ files_id: ids[5] })).toBe(0)
		const stale = await files.findOne({ gridfs_id: ids[4] }).lean()
		expect(stale.refs).toEqual([])
		expect(stale.orphaned_at).toBeInstanceOf(Date)
	})
})
