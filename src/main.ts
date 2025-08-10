import { RequestMethod, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import './instrument'

async function bootstrap() {
	try {
		const app = await NestFactory.create<NestFastifyApplication>(
			AppModule,
			new FastifyAdapter({
				logger: {
					name: 'WMS-API',
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
				logger: false
			}
		)

		const configService = app.get(ConfigService)
		app.setGlobalPrefix('/api', {
			exclude: [
				{ path: '/', method: RequestMethod.GET },
				{ path: '/metrics', method: RequestMethod.GET }
			]
		})

		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		app.useLogger(false)
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
