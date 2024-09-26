import { CacheOptions } from '@nestjs/cache-manager'
import { ConfigFactory } from '@nestjs/config'
import { ThrottlerOptions } from '@nestjs/throttler'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { redisStore } from 'cache-manager-redis-store'
import 'dotenv/config'
import { I18nOptions } from 'nestjs-i18n'
import path from 'path'
import { RedisClientOptions } from 'redis'

export const appConfigFactory: ConfigFactory = () => ({
	cache: {
		store: redisStore,
		socket: {
			host: process.env.REDIS_HOST,
			port: +process.env.REDIS_PORT
		}
	} satisfies CacheOptions<RedisClientOptions>,
	i18n: {
		fallbackLanguage: process.env.FALLBACK_LANGUAGE,
		loaderOptions: {
			path: path.join(__dirname, '..', '/i18n/'),
			watch: true
		},
		typesOutputPath: path.join(__dirname, '../..', '/src/generated/i18n.generated.ts')
	} satisfies I18nOptions,
	database: {
		type: process.env.DB_TYPE,
		host: process.env.DB_HOST,
		port: +process.env.DB_PORT,
		username: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		entities: [path.join(__dirname, '**', '*.entity.{ts,js}')],
		migrations: [path.join(__dirname, '/migrations/**/*{.ts,.js}')],
		subscribers: [path.join(__dirname, '**', '*.subscriber{.ts,.js}')],
		autoLoadEntities: true,
		options: {
			trustServerCertificate: Boolean(process.env.DB_TRUST_SERVER_CERTIFICATE),
			encrypt: false,
			enableArithAbort: true,
			connectTimeout: Number(process.env.DB_CONNECTION_TIMEOUT)
		},
		synchronize: false,
		cache: {
			type: 'redis',
			options: {
				socket: {
					host: process.env.REDIS_HOST,
					port: +process.env.REDIS_PORT
				}
			},
			ignoreErrors: true
		}
	} satisfies TypeOrmModuleOptions,
	throttler: {
		ttl: +process.env.THROTTLER_TTL,
		limit: +process.env.THROTTLER_LIMIT
	} satisfies ThrottlerOptions
})
