import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { fileTypeStream } from 'file-type/node'
import { ClientSession, Connection, Model, mongo, Types } from 'mongoose'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { StoredFile } from './stored-file.schema'

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

@Injectable()
export class FilesService {
	constructor(
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection,
		@InjectModel(StoredFile.name, DATA_WAREHOUSE_CONNECTION) private readonly files: Model<StoredFile>
	) {}

	private bucket() {
		return new mongo.GridFSBucket(this.connection.db, {
			bucketName: 'images',
			readPreference: mongo.ReadPreference.primary
		})
	}

	async upload(stream: Readable, ownerId: Types.ObjectId) {
		const detected = await fileTypeStream(stream)
		const mimetype = detected.fileType?.mime
		if (!mimetype || !IMAGE_TYPES.has(mimetype)) {
			detected.resume()
			throw new BadRequestException('Unsupported image type')
		}
		const id = new Types.ObjectId()
		let size = 0
		const counter = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				size += chunk.length
				callback(size > MAX_IMAGE_SIZE ? new BadRequestException('Image exceeds 5 MB') : null, chunk)
			}
		})
		const upload = this.bucket().openUploadStreamWithId(id, id.toString(), { contentType: mimetype })
		try {
			await pipeline(detected, counter, upload)
			await this.files.create({ gridfs_id: id, owner_id: ownerId, mimetype, size })
		} catch (error) {
			await this.connection.db.collection('images.files').deleteOne({ _id: id })
			await this.connection.db.collection('images.chunks').deleteMany({ files_id: id })
			throw error
		}
		return { id: id.toString(), url: `/files/${id}` }
	}

	async download(id: string) {
		if (!/^[a-f0-9]{24}$/.test(id)) throw new NotFoundException()
		const file = await this.files
			.findOne({ gridfs_id: new Types.ObjectId(id), cleanup_started_at: { $exists: false } })
			.read('primary')
			.lean()
		if (!file) throw new NotFoundException()
		return { file, stream: () => this.bucket().openDownloadStream(file.gridfs_id) }
	}

	async syncImageRefs(ownerKey: string, oldIds: string[], newIds: string[], session: ClientSession) {
		const oldSet = new Set(oldIds)
		const newSet = new Set(newIds)
		const added = [...newSet].filter((id) => !oldSet.has(id))
		const removed = [...oldSet].filter((id) => !newSet.has(id))
		if (added.length) {
			const result = await this.files.updateMany(
				{ gridfs_id: { $in: added.map((id) => new Types.ObjectId(id)) }, cleanup_started_at: { $exists: false } },
				{ $addToSet: { refs: ownerKey }, $set: { status: 'attached' }, $unset: { orphaned_at: 1 } },
				{ session }
			)
			if (result.matchedCount !== added.length) throw new BadRequestException('Image not found or being deleted')
		}
		if (removed.length) {
			const filter = { gridfs_id: { $in: removed.map((id) => new Types.ObjectId(id)) } }
			await this.files.updateMany(filter, { $pull: { refs: ownerKey } }, { session })
			await this.files.updateMany(
				{ ...filter, refs: { $size: 0 }, orphaned_at: { $exists: false } },
				{ $set: { orphaned_at: new Date() } },
				{ session }
			)
		}
	}
}
