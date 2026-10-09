export interface StoredSignature {
	buffer: Buffer
	contentType: string
}

export interface ISignatureStorage {
	/** Stores a base64 (optionally data URL) image and returns the id of the stored file. */
	upload(base64: string, filename: string): Promise<string>
	/** @returns `null` when the id is not a valid ObjectId or the file does not exist */
	download(id: string): Promise<StoredSignature | null>
	/** Best effort removal, never throws. */
	remove(id: string | null | undefined): Promise<void>
}

export const SIGNATURE_STORAGE = Symbol('ISignatureStorage')
