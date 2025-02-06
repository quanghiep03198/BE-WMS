/* eslint-disable @typescript-eslint/no-unused-vars */
import { DataSourceOptions } from 'typeorm'

export declare global {
	type RuntimeEnvironment = 'development' | 'production' | 'test'

	interface PaginationParams {
		limit: number
		page: number
	}
	interface Pagination<T = unknown> extends PaginationParams {
		data: Array<T>
		hasNextPage: boolean
		hasPrevPage: boolean
		totalDocs: number
		totalPages: number
	}

	type DatabaseType<T = 'mssql'> = Extract<DataSourceOptions['type'], T>

	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: RuntimeEnvironment
			HOST: string
			PORT: string
			FALLBACK_LANGUAGE: string
			// * Throttler
			THROTTLER_TTL: string
			THROTTLER_LIMIT: string
			// * Database
			DB_TYPE: DataSourceOptions['type']
			DB_HOST: string
			SEEDING_DB_HOST: string
			MIGRATION_DB_HOST: string
			DB_USERNAME: string
			DB_PASSWORD: string
			DB_PORT: string
			DB_TRUST_SERVER_CERTIFICATE: string
			DB_CONNECTION_TIMEOUT: string

			MONGO_URI: string
			// * Third-party API
			THIRD_PARTY_OAUTH_API_URL: string
			THIRD_PARTY_API_URL: string
			GL1_CLIENT_ID: string
			GL1_CLIENT_SECRET: string
			GL3_CLIENT_ID: string
			GL3_CLIENT_SECRET: string
			GL4_CLIENT_ID: string
			GL4_CLIENT_SECRET: string
			// * Tenancy
			TENANT_DEV: string
			TENANT_MAIN_19: string
			TENANT_MAIN_21: string
			TENANT_VN_LIANYING_PRIMARY: string
			TENANT_VN_LIANYING_SECONDARY: string
			TENANT_VN_LIANSHUN_PRIMARY: string
			TENANT_VN_LIANSHUN_SECONDARY: string
			TENANT_KM_PRIMARY: string
			TENANT_KM_SECONDARY: string
			// * Redis
			REDIS_HOST: string
			REDIS_PORT: string
			REDIS_PASSWORD: string
			// * Bcrypt
			SALT_ROUND: string
			// * Jwt
			JWT_SECRET: string
			JWT_EXPIRES: string
			// * Sentry
			SENTRY_DSN: string
			SENTRY_AUTH_TOKEN: string
		}
	}

	// eslint-disable-next-line unused-imports/no-unused-vars
	type FirstParameter<T> = T extends (first: infer FirstArgument, ...args: any[]) => infer T ? FirstArgument : never

	type ProcessEnv = {
		[K in keyof NodeJS.ProcessEnv as string extends K ? never : number extends K ? never : K]: NodeJS.ProcessEnv[K]
	}
}
