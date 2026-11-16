import type mssql from 'mssql'
import type { MigrationEnv } from './migration-env'

export function migrationMssqlConfig(host: string | undefined, config: MigrationEnv): mssql.config {
	const user = config.DB_USERNAME
	const password = config.DB_PASSWORD
	if (!host?.trim()) throw new Error('DB_HOST is required')
	if (!user?.trim() || !password) throw new Error('DB_USERNAME and DB_PASSWORD are required')
	const port = config.DB_PORT?.trim() ? Number(config.DB_PORT) : 1433
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_PORT')
	const connectionTimeout = config.DB_CONNECTION_TIMEOUT?.trim() ? Number(config.DB_CONNECTION_TIMEOUT) : 30000
	if (!Number.isSafeInteger(connectionTimeout) || connectionTimeout < 1)
		throw new Error('Invalid DB_CONNECTION_TIMEOUT')
	const trust = config.DB_TRUST_SERVER_CERTIFICATE?.trim()
	if (trust && trust !== 'true' && trust !== 'false') throw new Error('Invalid DB_TRUST_SERVER_CERTIFICATE')
	return {
		server: host,
		user,
		password,
		database: 'DV_DATA_LAKE',
		port,
		connectionTimeout,
		requestTimeout: 120000,
		options: {
			encrypt: true,
			trustServerCertificate: !trust || trust === 'true'
		}
	}
}
