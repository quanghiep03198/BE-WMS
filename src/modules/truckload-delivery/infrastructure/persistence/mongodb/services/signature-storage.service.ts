import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection, mongo, Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ISignatureStorage, StoredSignature } from '../../../../application/ports/signature-storage.port'
import { SIGNATURE_BUCKET_NAME } from '../../../../domain/constants'

const DATA_URL_PATTERN = /^data:(image\/[\w.+-]+);base64,/
const DEFAULT_CONTENT_TYPE = 'image/png'
const REDIS_TTL_MS = 24 * 60 * 60 * 1000
const MEMORY_MAX_ENTRIES = 200

@Injectable()
export class SignatureStorage implements ISignatureStorage {
	private bucket?: mongo.GridFSBucket
	/** Insertion ordered map used as a small LRU in front of Redis. Files are immutable, so entries never go stale. */
	private readonly memory = new Map<string, StoredSignature>()

	constructor(
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectPinoLogger(SignatureStorage.name) private readonly logger: PinoLogger
	) {}

	async upload(base64: string, filename: string): Promise<string> {
		const contentType = DATA_URL_PATTERN.exec(base64)?.[1] ?? DEFAULT_CONTENT_TYPE
		const buffer = Buffer.from(base64.replace(DATA_URL_PATTERN, ''), 'base64')

		const stream = this.getBucket().openUploadStream(filename, { metadata: { contentType } })
		await new Promise<void>((resolve, reject) => {
			stream.once('finish', () => resolve())
			stream.once('error', reject)
			stream.end(buffer)
		})
		return stream.id.toString()
	}

	async download(id: string): Promise<StoredSignature | null> {
		if (!Types.ObjectId.isValid(id)) return null

		const hot = this.memory.get(id)
		if (hot) {
			this.memory.delete(id)
			this.memory.set(id, hot)
			return hot
		}

		const cacheKey = this.cacheKey(id)
		const cached = await this.cacheManager.get<{ contentType: string; data: string }>(cacheKey)
		if (cached)
			return this.remember(id, { contentType: cached.contentType, buffer: Buffer.from(cached.data, 'base64') })

		const objectId = new Types.ObjectId(id)
		const [file] = await this.getBucket().find({ _id: objectId }, { limit: 1 }).toArray()
		if (!file) return null

		const chunks: Buffer[] = []
		for await (const chunk of this.getBucket().openDownloadStream(objectId)) chunks.push(chunk as Buffer)
		const signature: StoredSignature = {
			buffer: Buffer.concat(chunks),
			contentType: file.metadata?.contentType ?? DEFAULT_CONTENT_TYPE
		}

		await this.cacheManager.set(
			cacheKey,
			{ contentType: signature.contentType, data: signature.buffer.toString('base64') },
			REDIS_TTL_MS
		)
		return this.remember(id, signature)
	}

	async remove(id: string | null | undefined): Promise<void> {
		if (!id || !Types.ObjectId.isValid(id)) return
		try {
			await this.getBucket().delete(new Types.ObjectId(id))
			this.memory.delete(id)
			await this.cacheManager.del(this.cacheKey(id))
		} catch (error) {
			this.logger.warn({ err: error }, `Failed to remove signature file ${id}`)
		}
	}

	private remember(id: string, signature: StoredSignature): StoredSignature {
		this.memory.set(id, signature)
		if (this.memory.size > MEMORY_MAX_ENTRIES) this.memory.delete(this.memory.keys().next().value as string)
		return signature
	}

	private cacheKey(id: string) {
		return `truckload-delivery:signature:${id}`
	}

	private getBucket(): mongo.GridFSBucket {
		this.bucket ??= new mongo.GridFSBucket(this.connection.db as mongo.Db, { bucketName: SIGNATURE_BUCKET_NAME })
		return this.bucket
	}
}
