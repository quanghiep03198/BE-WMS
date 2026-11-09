import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { RequestMethod } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { Readable } from 'node:stream'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'

jest.mock('file-type/node', () => ({ fileTypeStream: jest.fn() }))

describe('FilesController', () => {
	let app: NestFastifyApplication
	const id = '0123456789abcdef01234567'
	const service = {
		upload: jest.fn(async (stream: Readable) => {
			for await (const chunk of stream) void chunk
			return { id, url: `/files/${id}` }
		}),
		download: jest.fn(async () => ({
			file: { mimetype: 'image/png' },
			stream: () => Readable.from(Buffer.from('image'))
		}))
	}

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [FilesController],
			providers: [
				{ provide: FilesService, useValue: service },
				{
					provide: JwtService,
					useValue: { verifyAsync: jest.fn().mockResolvedValue({ _id: id, username: 'test' }) }
				},
				{ provide: CACHE_MANAGER, useValue: { get: jest.fn().mockResolvedValue('token') } }
			]
		}).compile()
		app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
		app.setGlobalPrefix('/api', {
			exclude: [
				{ path: '/files/:id', method: RequestMethod.GET },
				{ path: '/uploads/images', method: RequestMethod.POST }
			]
		})
		app.getHttpAdapter()
			.getInstance()
			.addHook('onRequest', (request, _reply, done) => {
				request.cookies = request.headers.cookie?.includes('access-token=token') ? { 'access-token': 'token' } : {}
				done()
			})
		await app.register(import('@fastify/multipart'))
		await app.init()
		await app.getHttpAdapter().getInstance().ready()
	})

	afterAll(async () => app.close())

	it('requires the project authentication cookie', async () => {
		const response = await app.inject({ method: 'GET', url: `/files/${id}` })
		expect(response.statusCode).toBe(401)
	})

	it('streams files with private cache headers and supports conditional GET', async () => {
		const headers = { cookie: 'access-token=token' }
		const response = await app.inject({ method: 'GET', url: `/files/${id}`, headers })
		expect(response.statusCode).toBe(200)
		expect(response.headers['content-type']).toBe('image/png')
		expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable')
		expect(response.headers.etag).toBe(`"${id}"`)
		expect(response.body).toBe('image')
		const cached = await app.inject({
			method: 'GET',
			url: `/files/${id}`,
			headers: { ...headers, 'if-none-match': `W/"${id}"` }
		})
		expect(cached.statusCode).toBe(304)
		expect(cached.body).toBe('')
	})

	it('accepts multipart upload at the unprefixed endpoint', async () => {
		const boundary = 'image-test-boundary'
		const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\nimage\r\n--${boundary}--\r\n`
		const response = await app.inject({
			method: 'POST',
			url: '/uploads/images',
			headers: { cookie: 'access-token=token', 'content-type': `multipart/form-data; boundary=${boundary}` },
			payload
		})
		expect(response.statusCode).toBe(201)
		expect(response.json()).toEqual({ id, url: `/files/${id}` })
	})
})
