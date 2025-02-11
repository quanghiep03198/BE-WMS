import env from '@/common/utils/env.util'
import { BullRootModuleOptions } from '@nestjs/bullmq'
import { CacheModuleOptions } from '@nestjs/cache-manager'
import { ConfigFactory } from '@nestjs/config'
import { MongooseModuleOptions } from '@nestjs/mongoose'
import { ThrottlerOptions } from '@nestjs/throttler'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import * as redisStore from 'cache-manager-redis-store'
import { I18nOptions } from 'nestjs-i18n'
import path from 'path'
import { RedisClientOptions } from 'redis'

export const appConfigFactory: ConfigFactory = () => ({
	cache: {
		store: redisStore,
		host: env('REDIS_HOST'),
		port: env('REDIS_PORT', { serialize: (value): number => parseInt(value) }),
		password: env('REDIS_PASSWORD')
	} as CacheModuleOptions<RedisClientOptions>,
	i18n: {
		fallbackLanguage: env('FALLBACK_LANGUAGE', { fallbackValue: 'en' }),
		loaderOptions: {
			path: path.join(__dirname, '..', '/i18n/'),
			watch: true
		},
		typesOutputPath: path.join(__dirname, '../..', '/src/generated/i18n.generated.ts')
	} satisfies I18nOptions,
	mssql: {
		type: 'mssql',
		host: env('DB_HOST'),
		port: env('DB_PORT', { serialize: (value): number => parseInt(value) }),
		username: env('DB_USERNAME'),
		password: env('DB_PASSWORD'),
		schema: 'dbo',
		entities: [path.join(__dirname, '**', '*.entity.{ts,js}')],
		subscribers: [path.join(__dirname, '**', '*.subscriber.{ts,js}')],
		migrations: [path.join(__dirname, '/migrations/**/*.{ts,js}')],
		autoLoadEntities: true,
		synchronize: false,
		logging: ['error'],
		requestTimeout: 30000,
		options: {
			trustServerCertificate: env('DB_TRUST_SERVER_CERTIFICATE', {
				serialize: (value): boolean => value === 'true'
			}),
			encrypt: false,
			enableArithAbort: true,
			connectTimeout: env('DB_CONNECTION_TIMEOUT', { serialize: (value): number => parseInt(value) })
		},
		cache: {
			type: 'redis',
			options: {
				socket: {
					host: env('REDIS_HOST'),
					port: env('REDIS_PORT', { serialize: (value): number => parseInt(value) }),
					password: env('REDIS_PASSWORD')
				}
			},
			ignoreErrors: true
		}
	} satisfies TypeOrmModuleOptions,
	mongodb: {
		uri: env('MONGO_URI'),
		maxPoolSize: 100,
		connectTimeoutMS: 10000
	} satisfies MongooseModuleOptions,
	bullmq: {
		connection: {
			host: env('REDIS_HOST'),
			port: env('REDIS_PORT', { serialize: (value): number => parseInt(value) }),
			password: env('REDIS_PASSWORD')
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
	throttler: [
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
	] satisfies ThrottlerOptions[]
})
