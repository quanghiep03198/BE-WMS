import { Environment, Languages } from '@common/constants'
import { stringToBoolean } from '@common/utils'
import { z } from 'zod'

export const envConfigDTO = z.object({
	// * Application
	NODE_ENV: z.nativeEnum(Environment),
	HOST: z.string().trim().ip({ version: 'v4' }),
	PORT: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => +value),
	FALLBACK_LANGUAGE: z.nativeEnum(Languages),
	POSTMAN_DOCUMENTATION_URL: z.string().trim().nonempty().url().optional(),

	ENABLE_LOKI_LOGGER: z.enum(['true', 'false']).transform((value) => stringToBoolean(value)),
	ENABLE_PROMETHEUS_METRICS_LOGGER: z.enum(['true', 'false']).transform((value) => stringToBoolean(value)),

	// * Loki
	GRAFANA_LOKI_URL: z.string().trim().nonempty().url(),

	// * Throttler
	THROTTLER_TTL: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => +value),
	THROTTLER_LIMIT: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => Number(value)),

	// * MongoDB
	MONGO_URI: z.string().trim().nonempty(),
	MONGO_DB_NAME: z.string().trim().nonempty(),

	// * Redis
	REDIS_HOST: z.string().trim().nonempty().ip({ version: 'v4' }),
	REDIS_PORT: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => +value),
	REDIS_PASSWORD: z.string().trim().nonempty(),
	REDIS_DB: z
		.string()
		.trim()
		.nonempty()
		.default('0')
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => +value),

	// * SQL Server
	DB_TYPE: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => value === 'mssql'),
	DB_HOST: z.string().trim().nonempty(),
	DB_USERNAME: z.string().trim().nonempty(),
	DB_PASSWORD: z.string().trim().nonempty(),
	DB_PORT: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => Number(value)),
	DB_CONNECTION_TIMEOUT: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => Number(value)),
	DB_TRUST_SERVER_CERTIFICATE: z.string().transform((value) => Boolean(value) && JSON.parse(value)),

	// * Bcrypt
	SALT_ROUND: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => !Number.isNaN(+value))
		.transform((value) => Number(value)),

	// * JWT
	JWT_SECRET: z.string().trim().nonempty(),
	JWT_EXPIRES: z.string().trim().nonempty().or(z.number().positive()),

	// * Decker Third-party APIs
	DECKERS_OAUTH_API_URL: z.string().trim().nonempty().url(),
	DECKERS_API_URL: z.string().trim().nonempty().url(),
	DECKERS_GL1_CLIENT_ID: z.string().trim().nonempty(),
	DECKERS_GL1_CLIENT_SECRET: z.string().trim().nonempty(),
	DECKERS_GL3_CLIENT_ID: z.string().trim().nonempty(),
	DECKERS_GL3_CLIENT_SECRET: z.string().trim().nonempty(),
	DECKERS_GL4_CLIENT_ID: z.string().trim().nonempty(),
	DECKERS_GL4_CLIENT_SECRET: z.string().trim().nonempty(),

	// * Tenancy IPs
	TENANT_DEV: z.string().trim().nonempty().ip({ version: 'v4' }),
	TENANT_CENTRAL: z.string().trim().nonempty().ip({ version: 'v4' }),
	TENANT_GL1: z.string().trim().nonempty().ip({ version: 'v4' }),
	TENANT_GL3: z.string().trim().nonempty().ip({ version: 'v4' }),
	TENANT_GL4: z.string().trim().nonempty().ip({ version: 'v4' })

	// * Sentry
	// SENTRY_DSN: z.string().trim().nonempty().url(),
	// SENTRY_AUTH_TOKEN: z.string().trim().nonempty()
})
