import { z } from 'zod'

export enum Environment {
	DEVELOPMENT = 'development',
	PRODUCTION = 'production'
}

export const configValidator = z.object({
	NODE_ENV: z.nativeEnum(Environment),
	PORT: z.string().transform((value) => Number(value)),
	FALLBACK_LANGUAGE: z.enum(['en', 'vi', 'cn']),
	DB_HOST: z.string(),
	DB_USERNAME: z.string(),
	DB_PASSWORD: z.string(),
	DB_PORT: z.string(),
	DB_TRUST_SERVER_CERTIFICATE: z.string().transform((value) => Boolean(value) && JSON.parse(value)),
	SALT_ROUND: z.string(),
	JWT_SECRET: z.string()
})

export const configuration = () => ({})
