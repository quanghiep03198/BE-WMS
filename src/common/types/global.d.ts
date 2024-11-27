/* eslint-disable @typescript-eslint/no-unused-vars */
import { DataSourceOptions } from 'typeorm'

export declare global {
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
			NODE_ENV: 'development' | 'production' | 'test'
			PORT: string
			// * Throttler
			THROTTLER_TTL: string
			THROTTLER_LIMIT: string
			// * Database
			DB_TYPE: DataSourceOptions['type']
			DB_HOST: string
			DB_USERNAME: string
			DB_PASSWORD: string
			DB_PORT: string
			DB_TRUST_SERVER_CERTIFICATE: string
			DB_CONNECTION_TIMEOUT: string
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
			TENANT_MAIN: string
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
		}
	}

	// eslint-disable-next-line unused-imports/no-unused-vars
	type FirstParameter<T> = T extends (first: infer FirstArgument, ...args: any[]) => infer T ? FirstArgument : never
}
