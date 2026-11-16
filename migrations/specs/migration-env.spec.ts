import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMigrationEnv } from '../helpers/migration-env'

describe('migration environment', () => {
	it('reads only the specified file, not inherited environment values', () => {
		const dir = mkdtempSync(join(tmpdir(), 'warehouse-env-test-'))
		const path = join(dir, '.env')
		try {
			writeFileSync(path, 'DB_HOST=file-host\nDB_USERNAME=file-user\n')
			expect(loadMigrationEnv(path)).toEqual({ DB_HOST: 'file-host', DB_USERNAME: 'file-user' })
		} finally {
			unlinkSync(path)
			rmdirSync(dir)
		}
	})

	it('reports a missing migration file without falling back', () => {
		const dir = mkdtempSync(join(tmpdir(), 'warehouse-env-test-'))
		try {
			expect(() => loadMigrationEnv(join(dir, '.env'))).toThrow(/missing migrations\/.env/i)
		} finally {
			rmdirSync(dir)
		}
	})
})
