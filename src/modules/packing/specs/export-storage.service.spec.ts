import { ConfigService } from '@nestjs/config'
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExportStorageService } from '../services/export-storage.service'

describe('export storage', () => {
	it('rejects export directories beneath public or static folders', () => {
		const dir = join(tmpdir(), 'public', 'exports')
		const config = { get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback) }
		expect(() => new ExportStorageService(config as ConfigService)).toThrow('outside public and static')
	})

	it('removes expired xlsx and orphan tmp files but keeps newer files', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-export-test-'))
		try {
			const now = Date.now()
			await Promise.all(['old.xlsx', 'orphan.xlsx.tmp', 'new.xlsx'].map((name) => writeFile(join(dir, name), 'x')))
			const old = new Date(now - 25 * 60 * 60 * 1000)
			await Promise.all(['old.xlsx', 'orphan.xlsx.tmp'].map((name) => utimes(join(dir, name), old, old)))
			const config = { get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback) }
			const storage = new ExportStorageService(config as ConfigService)
			await storage.onModuleInit()
			expect(await readdir(dir)).toEqual(['new.xlsx'])
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
