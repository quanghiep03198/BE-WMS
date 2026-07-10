import { env } from '@common/utils'
import { DATABASE_SCHEMA } from '@databases/constants'
import { registerAs } from '@nestjs/config'
import { type TypeOrmModuleOptions } from '@nestjs/typeorm'
import path from 'node:path'

export default registerAs(
	'mssql',
	(): TypeOrmModuleOptions => ({
		type: 'mssql',
		host: env('DB_HOST'),
		port: env('DB_PORT', { serialize: (value): number => Number.parseInt(value) }),
		username: env('DB_USERNAME'),
		password: env('DB_PASSWORD'),
		schema: DATABASE_SCHEMA,
		entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
		migrations: [path.join(__dirname, '..', 'databases', 'migrations', '**', '*.{ts,js}')],
		autoLoadEntities: true,
		synchronize: false,
		logging: ['error'],
		requestTimeout: 30000,
		cache: {
			type: 'redis',
			options: {
				socket: {
					host: env('REDIS_HOST'),
					port: env('REDIS_PORT', { serialize: (value): number => Number.parseInt(value) })
				},
				db: env('REDIS_DB', { fallbackValue: 0, serialize: (value): number => Number.parseInt(value) }),
				password: env('REDIS_PASSWORD')
			},
			ignoreErrors: false
		},
		pool: {
			max: 100,
			min: 5,
			acquireTimeoutMillis: 30000
		},
		options: {
			trustServerCertificate: env('DB_TRUST_SERVER_CERTIFICATE', {
				serialize: (value): boolean => value === 'true'
			}),
			encrypt: false,
			enableArithAbort: true,
			connectTimeout: env('DB_CONNECTION_TIMEOUT', { serialize: (value): number => Number.parseInt(value) }),
			abortTransactionOnError: true,
			isolation: 'SNAPSHOT'
		},
		extra: {
			connectionLimit: 100,
			connectTimeout: 30000,
			acquireTimeout: 30000
		}
	})
)
