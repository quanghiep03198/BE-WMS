import { parse } from 'dotenv'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type MigrationEnv = Readonly<Record<string, string | undefined>>

const migrationEnvPath = fileURLToPath(new URL('../.env', import.meta.url))

export function loadMigrationEnv(path = migrationEnvPath): MigrationEnv {
	try {
		return parse(readFileSync(path, 'utf8'))
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			throw new Error('Missing migrations/.env; copy migrations/.env.example and configure it')
		}
		throw error
	}
}
