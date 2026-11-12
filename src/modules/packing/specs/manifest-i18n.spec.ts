import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@modules/auth/guards/roles.guard'
import { VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { Workbook } from 'exceljs'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, I18nService, QueryResolver } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import 'reflect-metadata'
import { ManifestExportWorker } from '../consumers/manifest-export.consumer'
import { ManifestController } from '../controllers/manifest.controller'
import { ExportStorageService } from '../services/export-storage.service'
import { ManifestExportService } from '../services/manifest-export.service'
import { ManifestService } from '../services/manifest.service'

describe('manifest export localization', () => {
	it.each([
		['vi', 'Mã đơn hàng', 'Tóm tắt', 'Báo cáo đóng hàng'],
		['en', 'Purchase order', 'Summary', 'Packing Manifest Report'],
		['cn', '订单编号', '摘要', '包裝清單報表']
	])('propagates X-Language %s to the generated Excel and filename', async (language, poHeader, summary, title) => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-i18n-test-'))
		const storage = new ExportStorageService({
			get: (key: string, fallback: unknown) => (key === 'EXPORT_DIR' ? dir : fallback)
		} as never)
		await storage.onModuleInit()
		const create = jest.fn().mockResolvedValue({ jobId: 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b' })
		const download = jest.fn().mockResolvedValue({
			stream: Readable.from(['xlsx']),
			factoryCode: 'VA1',
			language,
			timestamp: Date.UTC(2026, 0, 2)
		})
		const module = await Test.createTestingModule({
			imports: [
				I18nModule.forRoot({
					fallbackLanguage: 'en',
					loaderOptions: { path: join(process.cwd(), 'src', 'i18n'), watch: false },
					resolvers: [
						{ use: QueryResolver, options: ['lng'] },
						new HeaderResolver(['X-Language']),
						AcceptLanguageResolver
					]
				})
			],
			controllers: [ManifestController],
			providers: [
				{ provide: ManifestService, useValue: {} },
				{ provide: ManifestExportService, useValue: { create, download } },
				{ provide: ConfigService, useValue: { get: (_key: string, fallback: string) => fallback } },
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
		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		try {
			await app.init()
			await app.getHttpAdapter().getInstance().ready()
			const response = await app.inject({
				method: 'POST',
				url: '/packing-manifest/exports',
				headers: { 'x-api-version': '2', 'x-user-factory': 'VA1', 'x-language': language },
				payload: {}
			})
			expect(response.statusCode).toBe(200)
			expect(create).toHaveBeenCalledWith(expect.any(String), 'VA1', {}, language)
			if (language === 'vi') {
				for (const testCase of [
					{ url: '/packing-manifest/exports?lng=cn', headers: {}, expected: 'en' },
					{ url: '/packing-manifest/exports', headers: { 'accept-language': 'vi' }, expected: 'en' },
					{ url: '/packing-manifest/exports', headers: {}, expected: 'en' },
					{ url: '/packing-manifest/exports?lng=cn', headers: { 'x-language': 'en' }, expected: 'en' }
				]) {
					create.mockClear()
					const result = await app.inject({
						method: 'POST',
						url: testCase.url,
						headers: { 'x-api-version': '2', 'x-user-factory': 'VA1', ...testCase.headers },
						payload: {}
					})
					expect(result.statusCode).toBe(200)
					expect(create).toHaveBeenCalledWith(expect.any(String), 'VA1', {}, testCase.expected)
				}
				create.mockClear()
				const invalid = await app.inject({
					method: 'POST',
					url: '/packing-manifest/exports',
					headers: { 'x-api-version': '2', 'x-user-factory': 'VA1', 'x-language': 'fr' },
					payload: {}
				})
				expect(invalid.statusCode).toBe(422)
				expect(create).not.toHaveBeenCalled()
			}
			const repository = { count: async () => 0, batch: async () => [] }
			const worker = new ManifestExportWorker(repository as never, storage, app.get(I18nService))
			const id = response.json().jobId
			await worker.process({
				id,
				data: { factoryCode: 'VA1', filter: {}, language },
				updateProgress: async () => {}
			} as never)
			const workbook = new Workbook()
			await workbook.xlsx.load((await readFile(join(dir, `${id}.xlsx`))) as any)
			expect(workbook.worksheets[0].getRow(1).getCell(1).value).toContain(title)
			expect(workbook.worksheets[0].getRow(2).getCell(1).value).toBe(poHeader)
			expect(workbook.worksheets[0].getRow(3).getCell(1).value).toBe(summary)
			expect(workbook.worksheets[0].getCell('I3').formula).toBe('0')
			expect(workbook.worksheets[0].getCell('I3').result).toBe(0)
			const fileResponse = await app.inject({ method: 'GET', url: `/packing-manifest/exports/${id}/download` })
			expect(fileResponse.statusCode).toBe(200)
			const disposition = fileResponse.headers['content-disposition']
			expect(decodeURIComponent(disposition)).toContain(title)
			expect(decodeURIComponent(disposition)).toContain('2026-01-02.xlsx')
		} finally {
			await app.close()
			await rm(dir, { recursive: true, force: true })
		}
	})
})
