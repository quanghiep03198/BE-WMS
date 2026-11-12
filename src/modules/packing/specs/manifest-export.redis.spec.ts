import { Queue, QueueEvents, Worker } from 'bullmq'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ManifestExportWorker } from '../consumers/manifest-export.consumer'
import type { ManifestRow } from '../repositories/manifest.repository'
import { ExportStorageService } from '../services/export-storage.service'
import { ManifestExportService } from '../services/manifest-export.service'

const integration = process.env.RUN_MANIFEST_REDIS_TESTS === '1' ? it : it.skip

describe('manifest export with local Redis', () => {
	integration(
		'deduplicates concurrent jobs and completes a streamed file',
		async () => {
			config({ quiet: true })
			if (!['localhost', '127.0.0.1', '::1'].includes(process.env.REDIS_HOST ?? '')) {
				throw new Error('Integration test requires a local Redis instance')
			}
			const connection = {
				host: process.env.REDIS_HOST,
				port: Number(process.env.REDIS_PORT),
				password: process.env.REDIS_PASSWORD,
				db: Number(process.env.REDIS_DB || 0)
			}
			const name = `manifest-test-${randomUUID()}`
			const dir = await mkdtemp(join(tmpdir(), 'manifest-redis-test-'))
			const storage = new ExportStorageService({
				get: (key: string, fallback: unknown) => (key === 'EXPORT_DIR' ? dir : fallback)
			} as never)
			await storage.onModuleInit()
			let release: () => void
			const gate = new Promise<void>((resolve) => {
				release = resolve
			})
			const row = { po: 'A', cust_shoes_style: 'Style', cursor_id: 1 } as ManifestRow
			const repository = {
				count: async () => {
					await gate
					return 1
				},
				batch: async (_factory: string, _filter: unknown, after?: ManifestRow) => (after ? [] : [row])
			}
			const processor = new ManifestExportWorker(repository as never, storage, { t: (key: string) => key } as never)
			const queue = new Queue(name, { connection })
			const events = new QueueEvents(name, { connection })
			const worker = new Worker(name, (job) => processor.process(job), { connection })
			const service = new ManifestExportService(queue, storage)
			try {
				await Promise.all([worker.waitUntilReady(), events.waitUntilReady(), service.onModuleInit()])
				const [first, second] = await Promise.all([
					service.create('u1', 'VA1', { po: 'A' }),
					service.create('u1', 'VA1', { po: 'A' })
				])
				expect(second.jobId).toBe(first.jobId)
				await expect(service.create('u1', 'VA1', { po: 'B' })).rejects.toMatchObject({ status: 409 })
				release()
				const job = await queue.getJob(first.jobId)
				await job.waitUntilFinished(events, 30000)
				expect(await service.status('u1', first.jobId)).toMatchObject({
					status: 'done',
					processedRows: 1,
					totalRows: 1
				})
				expect(await storage.exists(first.jobId)).toBe(true)
			} finally {
				release()
				await worker.close()
				await events.close()
				await queue.obliterate({ force: true })
				await queue.close()
				await rm(dir, { recursive: true, force: true })
			}
		},
		60000
	)
})
