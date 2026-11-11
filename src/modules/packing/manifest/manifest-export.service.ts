import { InjectQueue } from '@nestjs/bullmq'
import { ConflictException, GoneException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { createHash, randomUUID } from 'node:crypto'
import { ExportStorageService } from './export-storage.service'
import type { ManifestFilterDto } from './manifest-filter.dto'

export const MANIFEST_EXPORT_QUEUE = 'packing-manifest-exports'
export interface ManifestExportData {
	userId: string
	factoryCode: string
	filter: ManifestFilterDto
	language: string
}
export interface ManifestExportResult {
	expiresAt: string
}
export interface ManifestProgress {
	processedRows: number
	totalRows: number
}

@Injectable()
export class ManifestExportService implements OnModuleInit {
	constructor(
		@InjectQueue(MANIFEST_EXPORT_QUEUE) private readonly queue: Queue<ManifestExportData, ManifestExportResult>,
		private readonly storage: ExportStorageService
	) {}

	async onModuleInit() {
		await this.queue.setGlobalConcurrency(1)
	}

	async create(userId: string, factoryCode: string, filter: ManifestFilterDto, language = 'en') {
		const dedupId = createHash('sha256').update(userId).digest('hex')
		const job = await this.queue.add(
			'export',
			{ userId, factoryCode, filter, language },
			{
				jobId: randomUUID(),
				deduplication: { id: dedupId },
				attempts: 3,
				backoff: { type: 'exponential', delay: 5000 },
				removeOnComplete: { age: this.storage.ttlSeconds },
				removeOnFail: { age: this.storage.ttlSeconds }
			}
		)
		const actual = await this.queue.getJob(job.id)
		if (!actual) throw new Error('Export job was not found after enqueue')
		const canonical = (value: ManifestFilterDto) =>
			JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
		if (
			actual.data.userId !== userId ||
			actual.data.factoryCode !== factoryCode ||
			(actual.data.language ?? 'en') !== language ||
			canonical(actual.data.filter) !== canonical(filter)
		) {
			throw new ConflictException('An export is already pending or processing for this user')
		}
		return { jobId: actual.id }
	}

	private async ownedJob(userId: string, jobId: string) {
		const job = await this.queue.getJob(jobId)
		if (job && job.data.userId !== userId) throw new NotFoundException()
		return job
	}

	async status(userId: string, jobId: string) {
		const job = await this.ownedJob(userId, jobId)
		if (!job) return { status: 'expired', processedRows: 0, totalRows: 0 }
		let progress: ManifestProgress
		const raw = job.progress
		if (raw === 0) {
			progress = { processedRows: 0, totalRows: 0 }
		} else if (
			typeof raw === 'object' &&
			raw !== null &&
			'processedRows' in raw &&
			'totalRows' in raw &&
			typeof raw.processedRows === 'number' &&
			typeof raw.totalRows === 'number' &&
			Number.isSafeInteger(raw.processedRows) &&
			Number.isSafeInteger(raw.totalRows) &&
			raw.processedRows >= 0 &&
			raw.totalRows >= 0
		) {
			progress = { processedRows: raw.processedRows, totalRows: raw.totalRows }
		} else {
			throw new Error('Invalid export progress')
		}
		const state = await job.getState()
		if (state === 'completed') {
			const expiresAt = job.returnvalue?.expiresAt
			if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)))
				throw new Error('Completed export has an invalid expiry timestamp')
			if (Date.now() >= Date.parse(expiresAt) || !(await this.storage.exists(jobId))) {
				return { status: 'expired', ...progress, expiresAt }
			}
			return { status: 'done', ...progress, expiresAt }
		}
		if (state === 'failed') return { status: 'failed', ...progress, error: job.failedReason }
		if (state === 'unknown') return { status: 'expired', ...progress }
		return { status: state === 'active' ? 'processing' : 'pending', ...progress }
	}

	async download(userId: string, jobId: string) {
		const job: Job<ManifestExportData, ManifestExportResult> | undefined = await this.ownedJob(userId, jobId)
		if (!job) throw new NotFoundException()
		const state = await this.status(userId, jobId)
		if (state.status === 'expired') throw new GoneException('Export has expired')
		if (state.status !== 'done') throw new ConflictException('Export is not complete')
		try {
			return await this.storage.getReadStream(jobId)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new GoneException('Export has expired')
			throw error
		}
	}
}
