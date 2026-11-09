import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'

const gunzipAsync = promisify(gunzip)

export async function decodeDescription(value: string | Buffer): Promise<string> {
	const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'base64')
	if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
		return (await gunzipAsync(bytes)).toString('utf8')
	}
	return Buffer.isBuffer(value) ? value.toString('utf8') : value
}
