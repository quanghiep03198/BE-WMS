import { DataSourceOptions } from 'typeorm'

export declare global {
	type Pagination<T = unknown> = {
		data: Array<T>
		hasNextPage: boolean
		hasPrevPage: boolean
		limit: number
		page: number
		totalDocs: number
		totalPages: number
	}

	type Bit = 0 | 1

	type DatabaseType<T = 'mssql'> = Extract<DataSourceOptions['type'], T>

	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: 'development' | 'production' | 'test'
			PORT: string
			THROTTLER_TTL: string
			THROTTLER_LIMIT: string
			DB_TYPE: DataSourceOptions['type']
			DB_HOST: string
			DB_USERNAME: string
			DB_PASSWORD: string
			DB_PORT: string
			DB_TRUST_SERVER_CERTIFICATE: string
			REDIS_HOST: string
			REDIS_PORT: string
			SALT_ROUND: string
			JWT_SECRET: string
		}
	}
}
