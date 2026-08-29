import bullmqConfig from './bullmq.config'
import cacheConfig from './cache.config'
import cdcConfig from './cdc.config'
import { envConfigDTO } from './dto/env.dto'
import i18nConfig from './i18n.config'
import loggerConfig from './logger.config'
import mongodbConfig from './mongodb.config'
import mssqlConfig from './mssql.config'
import observeConfig from './observe.config'
import throttlerConfig from './throttler.config'

export class AppConfig {
	public static load() {
		return [
			bullmqConfig,
			cacheConfig,
			cdcConfig,
			i18nConfig,
			loggerConfig,
			mongodbConfig,
			mssqlConfig,
			observeConfig,
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
