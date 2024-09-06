import { Languages } from '@/common/constants/global.enum'
import { z } from 'zod'

export enum Environment {
	DEVELOPMENT = 'development',
	PRODUCTION = 'production'
}

export const configValidator = z.object({
	NODE_ENV: z.nativeEnum(Environment),
	PORT: z
		.string()
		.trim()
		.min(1)
		.refine((value) => !isNaN(+value))
		.transform((value) => +value),
	FALLBACK_LANGUAGE: z.nativeEnum(Languages),
	DB_HOST: z.string().trim().min(1),
	DB_USERNAME: z.string().trim().min(1),
	DB_PASSWORD: z.string().trim().min(1),
	DB_PORT: z
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
