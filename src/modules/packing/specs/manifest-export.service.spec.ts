import { ConflictException, GoneException, NotFoundException } from '@nestjs/common'
import { Readable } from 'node:stream'
import { ManifestExportService } from '../services/manifest-export.service'

describe('manifest export jobs', () => {
	it('returns the owned job language and creation date with the download stream', async () => {
		const stream = Readable.from(['xlsx'])
		const job = {
			data: { userId: 'u1', factoryCode: 'VA1', language: 'vi' },
			timestamp: Date.UTC(2026, 0, 2),
			progress: 0,
			returnvalue: { expiresAt: new Date(Date.now() + 60000).toISOString() },
			getState: jest.fn().mockResolvedValue('completed')
		}
		const service = new ManifestExportService(
			{ getJob: jest.fn().mockResolvedValue(job) } as never,
			{ exists: jest.fn().mockResolvedValue(true), getReadStream: jest.fn().mockResolvedValue(stream) } as never
		)
		await expect(service.download('u1', 'id')).resolves.toEqual({
			stream,
			factoryCode: 'VA1',
			language: 'vi',
			timestamp: Date.UTC(2026, 0, 2)
		})
	})

	it('reuses the existing job for the same user and filter and rejects a different filter', async () => {
		const existing = {
			id: 'existing',
			data: { userId: 'u1', factoryCode: 'VA1', filter: { po: 'A' }, language: 'en' }
		}
		const queue = {
			add: jest.fn().mockResolvedValue(existing),
			getJob: jest.fn().mockResolvedValue(existing)
		}
		const service = new ManifestExportService(queue as never, { ttlSeconds: 86400 } as never)
		await expect(service.create('u1', 'VA1', { po: 'A' })).resolves.toEqual({ jobId: 'existing' })
		await expect(service.create('u1', 'VA1', { po: 'B' })).rejects.toBeInstanceOf(ConflictException)
		expect(queue.add.mock.calls[0][2].deduplication).toEqual({ id: expect.any(String) })
	})

	it('rejects a pending job in a different language instead of returning the wrong workbook', async () => {
		const existing = {
			id: 'existing',
			data: { userId: 'u1', factoryCode: 'VA1', filter: { po: 'A' }, language: 'vi' }
		}
		const queue = { add: jest.fn().mockResolvedValue(existing), getJob: jest.fn().mockResolvedValue(existing) }
		const service = new ManifestExportService(queue as never, { ttlSeconds: 86400 } as never)
		await expect(service.create('u1', 'VA1', { po: 'A' }, 'en')).rejects.toBeInstanceOf(ConflictException)
		await expect(service.create('u1', 'VA1', { po: 'A' }, 'vi')).resolves.toEqual({ jobId: 'existing' })
	})

	it('does not disclose another user’s job', async () => {
		const queue = { getJob: jest.fn().mockResolvedValue({ data: { userId: 'other' } }) }
		const service = new ManifestExportService(queue as never, {} as never)
		await expect(service.status('u1', 'id')).rejects.toBeInstanceOf(NotFoundException)
		await expect(service.download('u1', 'id')).rejects.toBeInstanceOf(NotFoundException)
	})

	it('reports a completed job as expired when its file has disappeared', async () => {
		const job = {
			data: { userId: 'u1' },
			progress: { processedRows: 7, totalRows: 7 },
			returnvalue: { expiresAt: new Date(Date.now() + 60000).toISOString() },
			getState: jest.fn().mockResolvedValue('completed')
		}
		const queue = { getJob: jest.fn().mockResolvedValue(job) }
		const service = new ManifestExportService(queue as never, { exists: jest.fn().mockResolvedValue(false) } as never)
		await expect(service.status('u1', 'id')).resolves.toMatchObject({
			status: 'expired',
			processedRows: 7,
			totalRows: 7
		})
		await expect(service.download('u1', 'id')).rejects.toBeInstanceOf(GoneException)
	})

	it('returns expired when job metadata has been removed', async () => {
		const service = new ManifestExportService(
			{ getJob: jest.fn().mockResolvedValue(undefined) } as never,
			{} as never
		)
		await expect(service.status('u1', 'id')).resolves.toEqual({ status: 'expired', processedRows: 0, totalRows: 0 })
		await expect(service.download('u1', 'id')).rejects.toBeInstanceOf(NotFoundException)
	})

	it('returns 410 if cleanup deletes the file immediately before it is opened', async () => {
		const job = {
			data: { userId: 'u1' },
			progress: 0,
			returnvalue: { expiresAt: new Date(Date.now() + 60000).toISOString() },
			getState: jest.fn().mockResolvedValue('completed')
		}
		const storage = {
			exists: jest.fn().mockResolvedValue(true),
			getReadStream: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
		}
		const service = new ManifestExportService({ getJob: jest.fn().mockResolvedValue(job) } as never, storage as never)
		await expect(service.download('u1', 'id')).rejects.toBeInstanceOf(GoneException)
	})

	it('rejects malformed progress instead of returning an invalid response shape', async () => {
		const job = { data: { userId: 'u1' }, progress: { processedRows: 'bad' } }
		const service = new ManifestExportService({ getJob: jest.fn().mockResolvedValue(job) } as never, {} as never)
		await expect(service.status('u1', 'id')).rejects.toThrow('Invalid export progress')
	})
})
