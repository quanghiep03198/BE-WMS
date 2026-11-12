import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@modules/auth/guards/roles.guard'
import { VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { Readable } from 'node:stream'
import 'reflect-metadata'
import { ManifestController } from '../controllers/manifest.controller'
import { ManifestExportService } from '../services/manifest-export.service'
import { ManifestService } from '../services/manifest.service'

describe('manifest list API', () => {
	it('routes v2 through validation and returns the unwrapped contract', async () => {
		const getList = jest.fn().mockResolvedValue({
			data: [],
			totalDocs: 0,
			totalPages: 0,
			page: 2,
			limit: 20,
			hasNextPage: false,
			hasPrevPage: true,
			nextPage: null,
			prevPage: 1
		})
		const exports = {
			create: jest.fn().mockResolvedValue({ jobId: 'job' }),
			status: jest.fn().mockResolvedValue({ status: 'pending', processedRows: 0, totalRows: 0 }),
			download: jest.fn().mockImplementation(async () => ({
				stream: Readable.from(['xlsx']),
				factoryCode: 'VA1',
				language: 'en',
				timestamp: Date.UTC(2026, 0, 2)
			}))
		}
		const module = await Test.createTestingModule({
			controllers: [ManifestController],
			providers: [
				{ provide: ManifestService, useValue: { getList } },
				{ provide: ManifestExportService, useValue: exports },
				{ provide: ConfigService, useValue: { get: (_key: string, fallback: string) => fallback } },
				{ provide: I18nService, useValue: { t: (key: string) => key } },
				{ provide: PinoLogger, useValue: { error: jest.fn() } }
			]
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({
				canActivate: (context) => {
					context.switchToHttp().getRequest().user = { _id: '507f1f77bcf86cd799439011' }
					return true
				}
			})
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.compile()
		const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
		app.setGlobalPrefix('/api')
		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		await app.init()
		await app.getHttpAdapter().getInstance().ready()
		try {
			const headers = { 'x-api-version': '2', 'x-user-factory': 'VA1' }
			const response = await app.inject({ method: 'GET', url: '/api/packing-manifest?_page=2', headers })
			expect(response.statusCode).toBe(200)
			expect(response.json()).toEqual({
				data: [],
				totalDocs: 0,
				totalPages: 0,
				page: 2,
				limit: 20,
				hasNextPage: false,
				hasPrevPage: true,
				nextPage: null,
				prevPage: 1
			})
			expect(getList).toHaveBeenCalledWith('VA1', { page: 2, pageSize: 20 })
			const fixedSize = await app.inject({
				method: 'GET',
				url: '/api/packing-manifest?_page=2&_limit=100',
				headers
			})
			expect(fixedSize.statusCode).toBe(200)
			expect(getList).toHaveBeenLastCalledWith('VA1', { page: 2, pageSize: 100 })
			const filtered = await app.inject({
				method: 'GET',
				url: '/api/packing-manifest?_page=1&_limit=10&_sort=po&_order=desc&po%3Aeq=PO123&target_box_qty%3Agte=2&q=Blue',
				headers
			})
			expect(filtered.statusCode).toBe(200)
			expect(getList).toHaveBeenLastCalledWith('VA1', {
				page: 1,
				pageSize: 10,
				sortBy: 'po',
				sortOrder: 'DESC',
				poEq: 'PO123',
				target_box_qtyFrom: 2,
				q: 'Blue'
			})
			expect(
				(await app.inject({ method: 'GET', url: '/api/packing-manifest', headers: { 'x-api-version': '2' } }))
					.statusCode
			).toBe(422)
			expect(
				(await app.inject({ method: 'GET', url: '/api/packing-manifest?sortBy=invalid', headers })).statusCode
			).toBe(422)
			expect(
				(
					await app.inject({
						method: 'GET',
						url: '/api/packing-manifest',
						headers: { ...headers, 'x-api-version': '1' }
					})
				).statusCode
			).toBe(404)
			const post = await app.inject({
				method: 'POST',
				url: '/api/packing-manifest/exports',
				headers,
				payload: { po: 'A' }
			})
			expect(post.statusCode).toBe(200)
			expect(post.json()).toEqual({ jobId: 'job' })
			expect(exports.create).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'VA1', { po: 'A' }, 'en')
			expect(
				(
					await app.inject({
						method: 'POST',
						url: '/api/packing-manifest/exports',
						headers: { ...headers, 'x-api-version': '1.0' },
						payload: { po: 'A' }
					})
				).statusCode
			).toBe(404)
			const status = await app.inject({ method: 'GET', url: '/api/packing-manifest/exports/job', headers })
			expect(status.json()).toEqual({ status: 'pending', processedRows: 0, totalRows: 0 })
			const download = await app.inject({
				method: 'GET',
				url: '/api/packing-manifest/exports/job/download',
				headers
			})
			expect(download.body).toBe('xlsx')
			expect(download.headers['content-type']).toContain('spreadsheetml')
			const browserDownload = await app.inject({
				method: 'GET',
				url: '/api/packing-manifest/exports/job/download'
			})
			expect(browserDownload.statusCode).toBe(200)
			expect(browserDownload.body).toBe('xlsx')
		} finally {
			await app.close()
		}
	})
})
