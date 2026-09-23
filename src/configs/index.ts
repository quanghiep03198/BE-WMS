import { ConfigFactory } from '@nestjs/config'
import bullmqConfig, { BULLMQ_CONFIG_TOKEN } from './bullmq.config'
import cacheConfig, { CACHE_CONFIG_TOKEN } from './cache.config'
import cdcConfig, { CDC_CONFIG_TOKEN } from './cdc.config'
import { envConfigDTO } from './dto/env.dto'
import i18nConfig, { I18N_CONFIG_TOKEN } from './i18n.config'
import loggerConfig, { LOGGER_CONFIG_TOKEN } from './logger.config'
import mongodbConfig, { MONGODB_CONFIG_TOKEN } from './mongodb.config'
import mssqlConfig, { MSSQL_CONFIG_TOKEN } from './mssql.config'
import throttlerConfig, { THROTTLER_CONFIG_TOKEN } from './throttler.config'

export interface IApplicationConfigFactory extends ProcessEnv {
	[BULLMQ_CONFIG_TOKEN]: ReturnType<typeof bullmqConfig>
	[CACHE_CONFIG_TOKEN]: ReturnType<typeof cacheConfig>
	[CDC_CONFIG_TOKEN]: ReturnType<typeof cdcConfig>
	[I18N_CONFIG_TOKEN]: ReturnType<typeof i18nConfig>
	[LOGGER_CONFIG_TOKEN]: ReturnType<typeof loggerConfig>
	[MONGODB_CONFIG_TOKEN]: ReturnType<typeof mongodbConfig>
	[MSSQL_CONFIG_TOKEN]: ReturnType<typeof mssqlConfig>
	[THROTTLER_CONFIG_TOKEN]: ReturnType<typeof throttlerConfig>
}

export {
	BULLMQ_CONFIG_TOKEN,
	CACHE_CONFIG_TOKEN,
	CDC_CONFIG_TOKEN,
	I18N_CONFIG_TOKEN,
	LOGGER_CONFIG_TOKEN,
	MONGODB_CONFIG_TOKEN,
	MSSQL_CONFIG_TOKEN,
	THROTTLER_CONFIG_TOKEN
}

export class AppConfig {
	public static load(): Array<ConfigFactory> {
		return [
			bullmqConfig,
			cacheConfig,
			cdcConfig,
			i18nConfig,
			loggerConfig,
			mongodbConfig,
			mssqlConfig,
			throttlerConfig
		]
	}

	public static validate(config: Record<string, unknown>) {
		const parsed = envConfigDTO.safeParse(config)
		if (!parsed.success) {
			console.error({ issues: parsed.error.issues }, 'Environment variable validation error')
			process.exit(1)
		}

		return parsed.data
	}
}
