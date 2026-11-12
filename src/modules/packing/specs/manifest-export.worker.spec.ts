import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { ManifestExportWorker } from '../consumers/manifest-export.consumer'
import type { ManifestRow } from '../repositories/manifest.repository'
import { ExportStorageService } from '../services/export-storage.service'

describe('manifest export worker', () => {
	it('writes batches using the same filter as count and reports progress', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-worker-test-'))
		try {
			const storage = new ExportStorageService({
				get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback)
			} as never)
			await storage.onModuleInit()
			const row = { po: 'A', cust_shoes_style: 'Style', cursor_id: 1 } as ManifestRow
			const repository = {
				count: jest.fn().mockResolvedValue(1),
				batch: jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([])
			}
			const worker = new ManifestExportWorker(repository as never, storage, { t: (key: string) => key } as never)
			const job = {
				id: 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b',
				data: { userId: 'u1', factoryCode: 'VA1', filter: { po: 'A' } },
				updateProgress: jest.fn().mockResolvedValue(undefined)
			}
			const result = await worker.process(job as never)
			expect(result.expiresAt).toBeTruthy()
			expect(repository.count).toHaveBeenCalledWith('VA1', job.data.filter)
			expect(repository.batch).toHaveBeenNthCalledWith(2, 'VA1', job.data.filter, row)
			expect(job.updateProgress).toHaveBeenLastCalledWith({ processedRows: 1, totalRows: 1 })
			expect(await storage.exists(job.id)).toBe(true)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('removes partial files and propagates errors for BullMQ retry', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-worker-failure-test-'))
		try {
			const storage = new ExportStorageService({
				get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback)
			} as never)
			await storage.onModuleInit()
			const row = { po: 'A', cust_shoes_style: 'Style', cursor_id: 1 } as ManifestRow
			const repository = {
				count: jest.fn().mockResolvedValue(1),
				batch: jest.fn().mockResolvedValueOnce([row]).mockRejectedValueOnce(new Error('database unavailable'))
			}
			const worker = new ManifestExportWorker(repository as never, storage, { t: (key: string) => key } as never)
			const job = {
				id: 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b',
				data: { userId: 'u1', factoryCode: 'VA1', filter: {} },
				updateProgress: jest.fn().mockResolvedValue(undefined)
			}
			await expect(worker.process(job as never)).rejects.toThrow('database unavailable')
			expect(await readdir(dir)).toEqual([])
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('cleans up the temporary file when writing fails', async () => {
		const sink = new Writable({
			write(_chunk, _encoding, callback) {
				callback(new Error('disk unavailable'))
			}
		})
		const storage = {
			ttlSeconds: 60,
			delete: jest.fn().mockResolvedValue(undefined),
			getWriteStream: jest.fn().mockReturnValue(sink)
		}
		const repository = { count: jest.fn().mockResolvedValue(0), batch: jest.fn().mockResolvedValue([]) }
		const worker = new ManifestExportWorker(
			repository as never,
			storage as never,
			{ t: (key: string) => key } as never
		)
		const job = {
			id: 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b',
			data: { userId: 'u1', factoryCode: 'VA1', filter: {} },
			updateProgress: jest.fn().mockResolvedValue(undefined)
		}
		await expect(worker.process(job as never)).rejects.toThrow('disk unavailable')
		expect(storage.delete).toHaveBeenLastCalledWith(job.id, true)
	})
})
