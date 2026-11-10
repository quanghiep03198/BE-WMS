import { BadRequestException } from '@nestjs/common'
import mongoose, { Connection, Model, Types } from 'mongoose'
import { Readable } from 'node:stream'
import { FilesService, MAX_IMAGE_SIZE } from '../files.service'
import { StoredFile, StoredFileSchema } from '../stored-file.schema'

jest.mock('file-type/node', () => ({
	fileTypeStream: jest.fn(async (stream: Readable) =>
		Object.assign(stream, { fileType: { ext: 'png', mime: 'image/png' } })
	)
}))

const mongoUri = process.env.FILES_TEST_MONGO_URI
const integration = mongoUri ? describe : describe.skip

integration('streaming uploads', () => {
	let connection: Connection
	let files: Model<StoredFile>
	let service: FilesService
	let uploadedId: Types.ObjectId
	const owner = new Types.ObjectId()

	beforeAll(async () => {
		connection = await mongoose.createConnection(mongoUri, { dbName: 'files_upload_integration' }).asPromise()
		files = connection.model(StoredFile.name, StoredFileSchema)
		service = new FilesService(connection, files)
	})

	afterAll(async () => {
		if (uploadedId) {
			await files.deleteOne({ gridfs_id: uploadedId })
			await connection.db.collection('images.files').deleteOne({ _id: uploadedId })
			await connection.db.collection('images.chunks').deleteMany({ files_id: uploadedId })
		}
		await connection.close()
	})

	it('accepts exactly 5 MiB and rejects 5 MiB plus one byte without leaving chunks', async () => {
		const result = await service.upload(Readable.from([Buffer.alloc(MAX_IMAGE_SIZE)]), owner)
		uploadedId = new Types.ObjectId(result.id)
		const file = await files.findOne({ gridfs_id: uploadedId }).read('primary').lean()
		expect(file.size).toBe(MAX_IMAGE_SIZE)
		const chunksBefore = await connection.db.collection('images.chunks').countDocuments()
		await expect(
			service.upload(Readable.from([Buffer.alloc(MAX_IMAGE_SIZE), Buffer.from([1])]), owner)
		).rejects.toBeInstanceOf(BadRequestException)
		expect(await connection.db.collection('images.chunks').countDocuments()).toBe(chunksBefore)
	})
})
