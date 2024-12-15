import env from '@/common/utils/env.util'
import { CacheModuleOptions } from '@nestjs/cache-manager'
import { ConfigFactory } from '@nestjs/config'
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
	database: {
		type: env('DB_TYPE'),
		host: env('DB_HOST'),
		port: env('DB_PORT', { serialize: (value): number => parseInt(value) }),
		username: env('DB_USERNAME'),
		password: env('DB_PASSWORD'),
		schema: 'dbo',
		entities: [path.join(__dirname, '**', '*.entity.{ts,js}')],
		migrations: [path.join(__dirname, '/migrations/**/*.{ts,js}')],
		subscribers: [path.join(__dirname, '**', '*.subscriber.{ts,js}')],
		autoLoadEntities: true,
		synchronize: false,
		logging: ['error'],
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
	throttler: {
		ttl: env('THROTTLER_TTL', { serialize: (value): number => parseInt(value) }),
		limit: env('THROTTLER_LIMIT', { serialize: (value): number => parseInt(value) })
	} satisfies ThrottlerOptions
})
