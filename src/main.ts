import { RequestMethod, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { env, stringToBoolean } from './common/utils'
import './instrument'

async function bootstrap() {
	try {
		const isProduction = env<RuntimeEnvironment>('NODE_ENV') === 'production'
		const isLokiEnabled = env<boolean>('ENABLE_LOKI_LOGGER', { fallbackValue: false, serialize: stringToBoolean })

		const app = await NestFactory.create<NestFastifyApplication>(
			AppModule,
			new FastifyAdapter({
				logger: {
					name: 'WMS-API',
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
								path: reply.raw?.req?.url,
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

		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		app.useLogger(isProduction ? false : logger)
		app.enableCors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] })
		await Promise.all([
			app.register(import('@fastify/multipart'), {
				limits: { files: 500, fieldSize: 1024 * 1024, fileSize: 10 * 1024 * 1024 }
			}),
			app.register(import('@fastify/helmet'), { global: true }),
			app.register(import('@fastify/compress'), {
				global: true,
				encodings: ['gzip', 'deflate'],
				threshold: 10 * 1024
			}),
			app.register(import('fastify-sse'))
		])

		await app.listen(+configService.get('PORT'), configService.get('HOST'), async () => {
			const url = await app.getUrl()
			logger.log(`Server listening at ${url}`)
		})
	} catch (error) {
		console.error(error)
	}
}

bootstrap()
