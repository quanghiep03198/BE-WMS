import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { createWriteStream } from 'node:fs'
import { access, mkdir, open, readdir, realpath, rename, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_TTL_SECONDS = 24 * 60 * 60

function assertPrivateDirectory(directory: string) {
	const segments = directory.split(/[\\/]+/).map((part) => part.toLowerCase())
	if (segments.includes('public') || segments.includes('static')) {
		throw new Error('EXPORT_DIR must be outside public and static directories')
	}
}

@Injectable()
export class ExportStorageService implements OnModuleInit {
	readonly directory: string
	readonly ttlSeconds: number

	constructor(config: ConfigService) {
		// API and worker must share this directory (same host or a shared volume).
		const directory = config.get<string>('EXPORT_DIR') || join(tmpdir(), 'i-wms-packing-manifests')
		if (!directory || !isAbsolute(directory)) throw new Error('EXPORT_DIR must be an absolute path')
		this.directory = resolve(directory)
		assertPrivateDirectory(this.directory)
		this.ttlSeconds = Number(config.get('EXPORT_TTL_SECONDS', DEFAULT_TTL_SECONDS))
		if (!Number.isSafeInteger(this.ttlSeconds) || this.ttlSeconds < 1) {
			throw new Error('EXPORT_TTL_SECONDS must be a positive integer')
		}
	}

	async onModuleInit() {
		await mkdir(this.directory, { recursive: true })
		assertPrivateDirectory(await realpath(this.directory))
		await this.cleanup()
	}

	private file(jobId: string, temporary = false) {
		if (!UUID.test(jobId)) throw new Error('Invalid export job ID')
		return join(this.directory, `${jobId}.xlsx${temporary ? '.tmp' : ''}`)
	}

	getWriteStream(jobId: string) {
		return createWriteStream(this.file(jobId, true), { flags: 'w' })
	}

	async finalize(jobId: string) {
		await rename(this.file(jobId, true), this.file(jobId))
	}

	async getReadStream(jobId: string) {
		const file = await open(this.file(jobId), 'r')
		return file.createReadStream()
	}

	async delete(jobId: string, temporary = false) {
		try {
			await unlink(this.file(jobId, temporary))
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		}
	}

	async exists(jobId: string) {
		try {
			await access(this.file(jobId))
			return true
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
			throw error
		}
	}

	@Cron(CronExpression.EVERY_30_MINUTES)
	async cleanup() {
		const cutoff = Date.now() - this.ttlSeconds * 1000
		const files = await readdir(this.directory, { withFileTypes: true })
		for (const file of files) {
			if (!file.isFile() || !/\.xlsx(?:\.tmp)?$/i.test(file.name)) continue
			const path = join(this.directory, file.name)
			try {
				if ((await stat(path)).mtimeMs < cutoff) await unlink(path)
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
			}
		}
	}
}
