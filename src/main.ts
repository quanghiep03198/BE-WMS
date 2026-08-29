import { RequestMethod, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { FastifyReply } from 'fastify/types/reply'
import { FastifyRequest } from 'fastify/types/request'
import { Logger } from 'nestjs-pino'
import { AppModule, ObserveInstrument } from './app.module'
import { env, stringToBoolean } from './common/utils'
// import './instrument'

declare const module: any

async function bootstrap() {
	try {
		const isProduction = env<RuntimeEnvironment>('NODE_ENV') === 'production'
		const isLokiEnabled = env<boolean>('ENABLE_LOKI_LOGGER', { fallbackValue: false, serialize: stringToBoolean })

		const app = await NestFactory.create<NestFastifyApplication>(
			AppModule,
			new FastifyAdapter({
				logger: {
					name: 'WMS-API',
					customLevels: {
						info: 0,
						debug: 1,
						trace: 2,
						warn: 3,
						error: 4,
						fatal: 5
					},
					useOnlyCustomLevels: true,
					hooks: {
						logMethod(args: Array<any>, method) {
							// * Skip logging for Prometheus metrics endpoint if disabled
							const requestLogConfig = args.at(0) as {
								req: FastifyRequest
								res: FastifyReply
							}
							const isPrometheusLogEnabled = env<boolean>('ENABLE_PROMETHEUS_METRICS_LOGGER', {
								fallbackValue: false,
								serialize: stringToBoolean
							})
							const endpoint = requestLogConfig?.res?.request?.raw?.url ?? requestLogConfig?.req?.url
							const isMetricsEndpoint = endpoint === '/metrics'
							if (!isPrometheusLogEnabled && isMetricsEndpoint) return
							return method.apply(this, args)
						}
					},
					transport: {
						target: isLokiEnabled ? 'pino-loki' : 'pino-pretty',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
							...(isLokiEnabled && {
								host: env<string>('GRAFANA_LOKI_URL'),
								labels: { service_name: 'WMS-API' },
								batching: true
							})
						}
					},
					serializers: {
						res(reply) {
							return {
								path: reply?.raw?.req?.url,
								statusCode: reply.statusCode
							}
						},
						req(request) {
							return {
								method: request.method,
								path: request.url,
								parameters: request.params,
								queries: request.query,
								headers: request.headers
							}
						}
					}
				}
			}),
			{
				instrument: ObserveInstrument,
				abortOnError: false,
				rawBody: true,
				bufferLogs: true
			}
		)

		const configService = app.get(ConfigService)
		const logger = app.get(Logger)
		app.setGlobalPrefix('/api', {
			exclude: [
				{ path: '/', method: RequestMethod.GET },
				{ path: '/metrics', method: RequestMethod.GET }
			]
		})

		const corsOrigins = configService.get<string>('CORS_ORIGINS', '').split(',')

		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		app.useLogger(isProduction ? false : logger)
		app.enableCors({
			origin: corsOrigins,
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
			preflightContinue: true,
			credentials: true
		})

		await app.register(import('@fastify/multipart'), {
			limits: { files: 500, fieldSize: 1024 * 1024, fileSize: 10 * 1024 * 1024 }
		})
		await app.register(import('@fastify/helmet'), { global: true })
		await app.register(import('@fastify/compress'), {
			global: true,
			encodings: ['gzip', 'deflate'],
			threshold: 10 * 1024
		})
		await app.register(import('@fastify/cookie'), { secret: configService.get<string>('COOKIE_SECRET') })

		await app.listen(+configService.get('PORT'), configService.get('HOST'), async () => {
			const url = await app.getUrl()
			logger.log(`Server listening at ${url}`)
		})

		if (module.hot) {
			module.hot.accept()
			module.hot.dispose(() => app.close())
		}
	} catch (error) {
		console.error(error)
	}
}

bootstrap()
