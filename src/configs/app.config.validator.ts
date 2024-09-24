import { Environment, Languages } from '@/common/constants'
import { Logger } from '@nestjs/common'
import { z } from 'zod'

export const configValidator = z.object({
	NODE_ENV: z.nativeEnum(Environment),
	HOST: z.string().trim().ip({ version: 'v4' }),
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
	JWT_SECRET: z.string().trim().min(1),
	JWT_EXPIRES: z.string().trim().min(1).or(z.number().positive())
})

export const validateConfig = async (config: Record<string, any>) => {
	try {
		return await configValidator.parseAsync(config)
	} catch (error) {
		Logger.error(error)
	}
}
