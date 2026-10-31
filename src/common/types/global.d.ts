/* eslint-disable @typescript-eslint/no-unused-vars */

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
		limit: number
		page: number
		nextPage: number | null
		prevPage: number | null
		totalDocs: number
		totalPages: number
	}

	type FactoryCode = 'VA1' | 'VB1' | 'VB2' | 'CA1'

	namespace NodeJS {
		interface ProcessEnv {
			// * Application
			NODE_ENV: RuntimeEnvironment
			HOST: string
			PORT: string
			FALLBACK_LANGUAGE: string
			GRAFANA_LOKI_URL: string
			POSTMAN_DOCUMENTATION_URL: string | undefined
			ENABLE_PROMETHEUS_METRICS_LOGGER: 'true' | 'false'
			ENABLE_LOKI_LOGGER: 'true' | 'false'
			CORS_ORIGINS: string
			APP_TENANCY: FactoryCode
			TZ: TTimezone

			// * Throttler
			THROTTLER_TTL: string
			THROTTLER_LIMIT: string

			// * Database
			DB_TYPE:
				| 'aurora-mysql'
				| 'aurora-postgres'
				| 'better-sqlite3'
				| 'capacitor'
				| 'cockroachdb'
				| 'cordova'
				| 'expo'
				| 'mariadb'
				| 'mongodb'
				| 'mssql'
				| 'mysql'
				| 'nativescript'
				| 'oracle'
				| 'postgres'
				| 'react-native'
				| 'sap'
				| 'spanner'
				| 'sqlite'
				| 'sqljs'
			DB_HOST: string
			SEEDING_DB_HOST: string
			MIGRATION_DB_HOST: string
			DB_USERNAME: string
			DB_PASSWORD: string
			DB_PORT: string
			DB_TRUST_SERVER_CERTIFICATE: string
			DB_CONNECTION_TIMEOUT: string

			OBSERVE_APP_KEY: string
			OBSERVE_APP_SECRET: string

			MONGO_URI: string
			MONGO_DB_NAME: string
			MONGO_REPLICA_SET: string

			// * Third-party API
			DECKERS_OAUTH_API_URL: string
			DECKERS_API_URL: string
			DECKERS_GL1_CLIENT_ID: string
			DECKERS_GL1_CLIENT_SECRET: string
			DECKERS_GL3_CLIENT_ID: string
			DECKERS_GL3_CLIENT_SECRET: string
			DECKERS_GL4_CLIENT_ID: string
			DECKERS_GL4_CLIENT_SECRET: string

			// * Tenancy - No longer used
			// TENANT_DEV: string
			TENANT_CENTRAL: string
			// TENANT_GL1: string
			// TENANT_GL3: string
			// TENANT_GL4: string

			// * Redis
			REDIS_HOST: string
			REDIS_PORT: string
			REDIS_PASSWORD: string
			REDIS_DB: string

			// * Bcrypt
			SALT_ROUND: string

			// * Jwt
			JWT_SECRET: string
			JWT_EXPIRES: string

			// * Cookie
			COOKIE_SECRET: string

			// * Sentry
			SENTRY_DSN: string
			SENTRY_AUTH_TOKEN: string
		}
	}

	namespace Storage {
		interface MultipartFile {
			toBuffer: () => Promise<Buffer>
			file: NodeJS.ReadableStream
			filepath: string
			fieldname: string
			filename: string
			encoding: string
			mimetype: string
			fields: import('@fastify/multipart').MultipartFields
		}
	}

	// eslint-disable-next-line unused-imports/no-unused-vars
	type FirstParameter<T> = T extends (first: infer FirstArgument, ...args: any[]) => infer T ? FirstArgument : never

	type ArrayElement<T> = T extends (infer U)[] ? U : T

	type ProcessEnv = {
		[K in keyof NodeJS.ProcessEnv as string extends K ? never : number extends K ? never : K]: NodeJS.ProcessEnv[K]
	}

	type WsResponseBody<T> = {
		event: string
		ok: boolean
		error: null | string | object
		metadata: T
	}

	type Boolish = boolean | 'true' | 'false'

	type Nullish<T> = T | null | undefined

	type ValueOfRecord<T extends Record<string, any>> = T[keyof T]

	type Chunk<T> = T[][]

	type TObjectId =
		| {
				id: string | Uint8Array
				__id?: string
				toString(encode?: 'hex' | 'base64'): string
				toHexString(): string
		  }
		| string
}
