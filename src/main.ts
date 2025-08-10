import { RequestMethod, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import './instrument'

async function bootstrap() {
	try {
		const app = await NestFactory.create<NestFastifyApplication>(
			AppModule,
			new FastifyAdapter({
				addHook: (routeOptions) => {
					if (routeOptions.url === '/metrics') {
						routeOptions.logLevel = 'silent'
					}

					return routeOptions
				},
				logger: {
					crlf: true,
					msgPrefix: '[HTTP]' + ' ',

					transport: {
						target: 'pino-pretty',
						options: {
							translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
						}
					},
					serializers: {
						res(reply) {
							return {
								path: reply.raw.req.url,
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
				bufferLogs: true,
				logger: process.env.NODE_ENV === 'production' ? false : undefined
			}
		)

		const configService = app.get(ConfigService)
		app.setGlobalPrefix('/api', {
			exclude: [
				{ path: '/', method: RequestMethod.GET },
				{ path: '/metrics', method: RequestMethod.GET }
			]
		})
		const logger = app.get(Logger)
		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		app.useLogger(process.env.NODE_ENV === 'production' ? false : logger)
		app.enableCors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] })
		await Promise.all([
			app.register(import('@fastify/multipart'), { limits: { files: 500, fileSize: 10 * 1024 } }),
			app.register(import('@fastify/helmet'), { global: true }),
			app.register(import('@fastify/compress'), { global: true, encodings: ['gzip', 'br'], threshold: 10 * 1024 }),
			app.register(import('fastify-sse'))
		])

		await app.listen(+configService.get('PORT'), configService.get('HOST'))
	} catch (error) {
		console.error(error)
	}
}

bootstrap()
