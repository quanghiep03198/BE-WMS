import { env, stringToBoolean } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { type Params } from 'nestjs-pino'

export default registerAs(
	'logger',
	(): Params => ({
		renameContext: 'WMS-API',
		pinoHttp: {
			name: 'WMS API',
			customLevels: {
				info: 0,
				debug: 1,
				trace: 2,
				warn: 3,
				error: 4,
				fatal: 5
			},
			autoLogging: {
				ignore: (req) => req.url.startsWith('/metrics')
			},
			useOnlyCustomLevels: true,
			transport: {
				targets: [
					{
						target: 'pino-pretty',
						level: 'info',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
						}
					},
					{
						target: 'pino-pretty',
						level: 'debug',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
							destination: 'logs/debug.log',
							colorize: false,
							append: true,
							ignore: 'req,res,context,responseTime,pid,hostname'
						}
					},
					{
						target: 'pino-pretty',
						level: 'warn',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
							destination: 'logs/error.log',
							colorize: false,
							append: true
						}
					},
					...(env<boolean>('ENABLE_LOKI_LOGGER', { fallbackValue: false, serialize: stringToBoolean })
						? [
								{
									target: 'pino-loki',
									options: {
										host: env<string>('GRAFANA_LOKI_URL'),
										labels: { service_name: 'WMS-API' },
										batching: true,
										translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
									}
								}
							]
						: [])
				]
			}
		}
	})
)
