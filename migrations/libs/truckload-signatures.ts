import { mongo } from 'mongoose'
import { createHash } from 'node:crypto'

const DATA_URL_PATTERN = /^data:(image\/[\w.+-]+);base64,/

export function decodeTruckloadSignature(value: string, label: string): { buffer: Buffer; contentType: string } | null {
	const base64 = value.replace(DATA_URL_PATTERN, '').replace(/\s/g, '')
	if (!base64) return null
	const buffer = Buffer.from(base64, 'base64')
	if (
		!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
		(base64.includes('=') && buffer.toString('base64') !== base64) ||
		buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')
	) {
		throw new Error(`Invalid truckload signature base64 for ${label}`)
	}
	return {
		buffer,
		contentType: DATA_URL_PATTERN.exec(value)?.[1] ?? 'image/png'
	}
}

export async function uploadTruckloadSignature(
	bucket: mongo.GridFSBucket,
	filename: string,
	signature: { buffer: Buffer; contentType: string }
): Promise<mongo.ObjectId> {
	const sha256 = createHash('sha256').update(signature.buffer).digest('hex')
	const [existing] = await bucket
		.find({ filename, 'metadata.contentType': signature.contentType, 'metadata.sha256': sha256 }, { limit: 1 })
		.toArray()
	if (existing) return existing._id

	const stream = bucket.openUploadStream(filename, { metadata: { contentType: signature.contentType, sha256 } })
	await new Promise<void>((resolve, reject) => {
		stream.once('finish', () => resolve())
		stream.once('error', reject)
		stream.end(signature.buffer)
	})
	return stream.id
}
