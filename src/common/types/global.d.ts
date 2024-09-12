import { TypeOrmModuleOptions } from '@nestjs/typeorm'

export declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: 'development' | 'production' | 'test'
			PORT: string
			THROTTLER_TTL: string
			THROTTLER_LIMIT: string
			DB_TYPE: TypeOrmModuleOptions['type']
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
