import { TransformInterceptor } from '@common/interceptors/transform.interceptor'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@modules/auth/guards/roles.guard'
import { Controller, Get, VERSION_NEUTRAL, Version, VersioningType } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import 'reflect-metadata'
import { PackingController } from '../packing.controller'
import { PackingService } from '../packing.service'

@Controller('version-probe')
class VersionProbeController {
	@Get()
	@Version([VERSION_NEUTRAL, '1'])
	getLegacy() {
		return 'legacy'
	}

	@Get()
	@Version('2')
	getNew() {
		return 'new'
	}
}

describe('Fastify header version routing', () => {
	it('serves legacy without a header and with v1, and v2 separately', async () => {
		const module = await Test.createTestingModule({ controllers: [VersionProbeController] }).compile()
		const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		await app.init()
		await app.getHttpAdapter().getInstance().ready()
		try {
			for (const [version, expected] of [
				['', 'legacy'],
				['1', 'legacy'],
				['2', 'new']
			] as const) {
				const response = await app.inject({
					method: 'GET',
					url: '/version-probe',
					headers: version ? { 'x-api-version': version } : {}
				})
				expect(response.statusCode).toBe(200)
				expect(response.body).toBe(expected)
			}
		} finally {
			await app.close()
		}
	})

	it('keeps the existing manifest and synchronous export available without a header and with v1', async () => {
		const getLegacy = jest.fn().mockResolvedValue([{ po: 'PO123' }])
		const exportPackingManifestToExcel = jest.fn().mockResolvedValue(Buffer.from('legacy-export'))
		const module = await Test.createTestingModule({
			controllers: [PackingController],
			providers: [
				{ provide: PackingService, useValue: { getLegacy, exportPackingManifestToExcel } },
				{ provide: PinoLogger, useValue: { error: jest.fn() } }
			]
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.overrideInterceptor(TransformInterceptor)
			.useValue({ intercept: (_context, next) => next.handle() })
			.compile()
		const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
		app.enableVersioning({ type: VersioningType.HEADER, header: 'X-Api-Version' })
		await app.init()
		await app.getHttpAdapter().getInstance().ready()
		try {
			for (const version of ['', '1']) {
				const headers = { 'x-user-factory': 'VA1', ...(version ? { 'x-api-version': version } : {}) }
				const list = await app.inject({ method: 'GET', url: '/packing/manifest', headers })
				expect(list.statusCode).toBe(200)
				expect(list.json()).toEqual([{ po: 'PO123' }])
				const download = await app.inject({ method: 'GET', url: '/packing/manifest/export', headers })
				expect(download.statusCode).toBe(200)
				expect(download.body).toBe('legacy-export')
			}
			expect(getLegacy).toHaveBeenCalledTimes(2)
			expect(exportPackingManifestToExcel).toHaveBeenCalledTimes(2)
		} finally {
			await app.close()
		}
	})
})
