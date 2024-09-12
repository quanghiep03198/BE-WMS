import { Environment, Languages } from '@/common/constants'
import { CacheOptions } from '@nestjs/cache-manager'
import { Logger } from '@nestjs/common'
import { ThrottlerOptions } from '@nestjs/throttler'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { redisStore } from 'cache-manager-redis-store'
import 'dotenv/config'
import { I18nOptions } from 'nestjs-i18n'
import path from 'path'
import { z } from 'zod'

export const configValidator = z.object({
	NODE_ENV: z.nativeEnum(Environment),
	PORT: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => +value),
	FALLBACK_LANGUAGE: z.nativeEnum(Languages),
	THROTTLER_TTL: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => +value),
	THROTTLER_LIMIT: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => Number(value)),
	DB_TYPE: z.string().trim().min(1),
	DB_HOST: z.string().trim().min(1),
	DB_USERNAME: z.string().trim().min(1),
	DB_PASSWORD: z.string().trim().min(1),
	DB_PORT: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => Number(value)),
	DB_CONNECTION_TIMEOUT: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => Number(value)),
	DB_TRUST_SERVER_CERTIFICATE: z.string().transform((value) => Boolean(value) && JSON.parse(value)),
	REDIS_HOST: z.string().trim().min(1),
	REDIS_PORT: z
		.string()
		.trim()
		.min(1)
		.refine((value) => value === '6379' || !isNaN(+value))
		.transform((value) => Number(value)),
	SALT_ROUND: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => Number(value)),
	JWT_SECRET: z.string().trim().min(1)
})

export const validateConfig = async (config: Record<string, any>) => {
	try {
		return await configValidator.parseAsync(config)
	} catch (error) {
		Logger.error(error)
	}
}

export const internalConfigs = () => ({
	cache: {
		store: async () =>
			await redisStore({
				socket: {
					host: process.env.REDIS_HOST,
					port: +process.env.REDIS_PORT
				}
			})
	} satisfies CacheOptions<any>,
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
		autoLoadEntities: true,
		options: {
			trustServerCertificate: Boolean(process.env.DB_TRUST_SERVER_CERTIFICATE),
			encrypt: false,
			enableArithAbort: true,
			connectTimeout: Number(process.env.DB_CONNECTION_TIMEOUT)
		},
		synchronize: false
	} satisfies Partial<TypeOrmModuleOptions>,
	throttler: {
		ttl: +process.env.THROTTLER_TTL,
		limit: +process.env.THROTTLER_LIMIT
	} satisfies ThrottlerOptions
})
