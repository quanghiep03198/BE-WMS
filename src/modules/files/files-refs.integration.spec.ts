import mongoose, { Connection, Model, Types } from 'mongoose'
import { FilesService } from './files.service'
import { StoredFile, StoredFileSchema } from './stored-file.schema'

jest.mock('file-type/node', () => ({ fileTypeStream: jest.fn() }))

const mongoUri = process.env.FILES_TEST_MONGO_URI
const integration = mongoUri ? describe : describe.skip

integration('syncImageRefs integration', () => {
	let connection: Connection
	let files: Model<StoredFile>
	let service: FilesService
	const id = new Types.ObjectId()
	const owner = new Types.ObjectId()

	beforeAll(async () => {
		connection = await mongoose.createConnection(mongoUri, { dbName: 'files_cleanup_integration' }).asPromise()
		files = connection.model(StoredFile.name, StoredFileSchema)
		service = new FilesService(connection, files)
		await files.create({ gridfs_id: id, owner_id: owner, mimetype: 'image/png', size: 1 })
	})

	afterAll(async () => {
		await files.deleteOne({ gridfs_id: id })
		await connection.close()
	})

	it('preserves shared refs, marks the final removal orphaned, and rolls back failures', async () => {
		const session = await connection.startSession()
		try {
			await session.withTransaction(
				async () => {
					await service.syncImageRefs('owner:1', [], [id.toString()], session)
					await service.syncImageRefs('owner:2', [], [id.toString()], session)
				},
				{ readPreference: 'primary' }
			)
			await session.withTransaction(
				async () => {
					await service.syncImageRefs('owner:1', [id.toString()], [], session)
				},
				{ readPreference: 'primary' }
			)
			let file = await files.findOne({ gridfs_id: id }).lean()
			expect(file.refs).toEqual(['owner:2'])
			expect(file.orphaned_at).toBeUndefined()
			await expect(
				session.withTransaction(
					async () => {
						await service.syncImageRefs('owner:2', [id.toString()], [], session)
						throw new Error('rollback')
					},
					{ readPreference: 'primary' }
				)
			).rejects.toThrow('rollback')
			file = await files.findOne({ gridfs_id: id }).lean()
			expect(file.refs).toEqual(['owner:2'])
			await session.withTransaction(
				async () => {
					await service.syncImageRefs('owner:2', [id.toString()], [], session)
				},
				{ readPreference: 'primary' }
			)
			file = await files.findOne({ gridfs_id: id }).lean()
			expect(file.refs).toEqual([])
			expect(file.orphaned_at).toBeInstanceOf(Date)
		} finally {
			await session.endSession()
		}
	})
})
