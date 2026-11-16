export interface EpcSyncSettings {
	concurrency: number
	batchSize: number
	chunkSize: number
	writeMode: 'upsert' | 'insert'
}

export const DEFAULT_EPC_SYNC_SETTINGS: Readonly<EpcSyncSettings> = {
	concurrency: 4,
	batchSize: 1000,
	chunkSize: 10000,
	writeMode: 'upsert'
}

export function parseEpcSyncSettings(values: ReadonlyMap<string, string>): EpcSyncSettings {
	const number = (name: string, fallback: number, min: number, max: number): number => {
		const raw = values.get(name)
		const value = raw === undefined ? fallback : Number(raw)
		if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`)
		return value
	}
	const batchSize = number('--batch-size', DEFAULT_EPC_SYNC_SETTINGS.batchSize, 1000, 5000)
	const chunkSize = number('--chunk-size', DEFAULT_EPC_SYNC_SETTINGS.chunkSize, 1, Number.MAX_SAFE_INTEGER)
	if (chunkSize < batchSize) throw new Error('Chunk size must be at least the batch size')
	const writeMode = values.get('--write-mode') ?? DEFAULT_EPC_SYNC_SETTINGS.writeMode
	if (writeMode !== 'upsert' && writeMode !== 'insert') throw new Error('Invalid EPC sync write mode')
	return {
		concurrency: number('--concurrency', DEFAULT_EPC_SYNC_SETTINGS.concurrency, 1, 64),
		batchSize,
		chunkSize,
		writeMode
	}
}
