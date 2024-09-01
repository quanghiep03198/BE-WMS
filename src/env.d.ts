// env.d.ts

export namespace NodeJS {
	export interface ProcessEnv {
		readonly NODE_ENV: 'development' | 'production' | 'test'
		readonly PORT: string
		readonly DB_HOST: string
		readonly DB_USERNAME: string
		readonly DB_PASSWORD: string
		readonly DB_PORT: string
		readonly DB_TRUST_SERVER_CERTIFICATE: string
		readonly REDIS_CLIENT: string
		readonly REDIS_HOST: string
		readonly REDIS_PASSWORD: string
		readonly REDIS_PORT: string
		readonly SALT_ROUND: string
		readonly JWT_SECRET: string
	}
}
