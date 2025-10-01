import { env } from '@/common/utils'
import { DATABASE_SCHEMA } from '@/databases/constants'
import { createKeyv, type RedisClientOptions } from '@keyv/redis'
import { type BullRootModuleOptions } from '@nestjs/bullmq'
import { type CacheModuleOptions } from '@nestjs/cache-manager'
import { type ConfigFactory } from '@nestjs/config'
import { type MongooseModuleOptions } from '@nestjs/mongoose'
import { type ThrottlerOptions } from '@nestjs/throttler'
import { type TypeOrmModuleOptions } from '@nestjs/typeorm'
import { AcceptLanguageResolver, HeaderResolver, I18nOptions } from 'nestjs-i18n'
import { Params } from 'nestjs-pino'
import path from 'node:path'

export const appConfigFactory: ConfigFactory = () => ({
	// * Redis BullMQ configuration
	['bullmq']: {
		connection: {
			host: env('REDIS_HOST'),
			port: env('REDIS_PORT', { serialize: (value): number => Number.parseInt(value) }),
			password: env('REDIS_PASSWORD'),
			db: env('REDIS_DB', { fallbackValue: 0, serialize: (value): number => Number.parseInt(value) })
		},
		defaultJobOptions: {
			removeOnComplete: true,
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 3000
			}
		}
	} satisfies BullRootModuleOptions,

	// * Cache manager with Keyv/Redis adapter configuration
	['cache']: {
		isGlobal: true,
		nonBlocking: true,
		stores: [
			createKeyv(
				{
					socket: {
						host: env('REDIS_HOST'),
						port: env('REDIS_PORT', { serialize: (value): number => Number.parseInt(value) })
					},
					database: env('REDIS_DB', { fallbackValue: 0, serialize: (value): number => Number.parseInt(value) }),
					password: env('REDIS_PASSWORD')
				},
				{ noNamespaceAffectsAll: false, useUnlink: true }
			)
		]
	} as CacheModuleOptions<RedisClientOptions>,

	// * Internationalization configuration
	['i18n']: {
		fallbackLanguage: env('FALLBACK_LANGUAGE', { fallbackValue: 'en' }),
		loaderOptions: {
			path: path.join(__dirname, '..', '/i18n/'),
			watch: env('NODE_ENV') === 'development'
		},
		typesOutputPath: path.join(__dirname, '../..', '/src/generated/i18n.generated.ts'),
		resolvers: [AcceptLanguageResolver, new HeaderResolver(['Accept-Language'])]
	} satisfies I18nOptions,

	// * Mongoose configuration
	['mongodb']: {
		uri: env('MONGO_URI'),
		dbName: env('MONGO_DB_NAME'),
		maxPoolSize: 100,
		connectTimeoutMS: 10000,
		readPreference: 'nearest',
		writeConcern: {
			w: 'majority'
		}
	} satisfies MongooseModuleOptions,

	// * TypeORM - MSSQL Server configuration
	['mssql']: {
		type: 'mssql',
		host: env('DB_HOST'),
		port: env('DB_PORT', { serialize: (value): number => Number.parseInt(value) }),
		username: env('DB_USERNAME'),
		password: env('DB_PASSWORD'),
		schema: DATABASE_SCHEMA,
		entities: [path.join(__dirname, '**', '*.entity.{ts,js}')],
		subscribers: [path.join(__dirname, '**', '*.subscriber.{ts,js}')],
		migrations: [path.join(__dirname, '/migrations/**/*.{ts,js}')],
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
	} satisfies TypeOrmModuleOptions,

	// * Request throttler configuration
	['throttler']: [
		{
			name: 'short',
			ttl: 1000,
			limit: 3
		},
		{
			name: 'medium',
			ttl: 10000,
			limit: 20
		},
		{
			name: 'long',
			ttl: 60000,
			limit: 100
		}
	] satisfies ThrottlerOptions[],

	// * Logger configuration
	['logger']: {
		renameContext: 'WMS-API',
		pinoHttp: {
			name: 'WMS API',
			customLevels: {
				info: 0,
				debug: 1,
				trace: 2,
				warn: 3,
				error: 4,
				fatal: 5
			},
			useOnlyCustomLevels: true,
			transport: {
				targets: [
					{
						target: 'pino-pretty',
						level: 'info',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
						}
					},
					{
						target: 'pino-pretty',
						level: 'debug',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
							destination: 'logs/debug.log',
							colorize: false,
							append: true
						}
					},
					{
						target: 'pino-pretty',
						level: 'warn',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
							destination: 'logs/error.log',
							colorize: false,
							append: true
						}
					},
					{
						target: 'pino-loki',
						options: {
							host: env<string>('GRAFANA_LOKI_URL'),
							labels: { service_name: 'WMS-API' },
							batching: true,
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
						}
					}
				]
			}
		}
	} satisfies Params
})
