import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { InjectQueue } from '@nestjs/bullmq'
import { Controller, Get, Headers, HttpStatus, Logger, Param, Req, Res } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { Request, Response } from 'express'
import { uniqBy } from 'lodash'
import { PaginateModel } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { FALLBACK_VALUE } from '../rfid/constants'
import { Epc, EpcDocument } from '../rfid/schemas/epc.schema'
import { IoRedisService } from './../../messages/ioredis.service'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiService } from './third-party-api.service'

@Controller('third-party-api')
export class ThirdPartyApiController {
	constructor(
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
		private readonly thirdPartyApiService: ThirdPartyApiService,
		private readonly i18nService: I18nService,
		private readonly ioRedisService: IoRedisService
	) {}

	@Api({
		endpoint: 'sync-decker-data',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@AuthGuard()
	async syncDeckerData(@Headers('X-Tenant-Id') tenantId: string, @Headers('X-User-Company') factoryCode: string) {
		const validUnknownEpcs = await this.epcModel.find({ mo_no: FALLBACK_VALUE }).lean(true)
		return await this.thirdPartyApiSyncQueue.add(
			tenantId,
			uniqBy(validUnknownEpcs, (item) => item.epc.substring(0, 22)).map((item) => item.epc),
			{
				jobId: factoryCode,
				removeOnComplete: true
			}
		)
	}

	@Api({
		endpoint: 'upsert-by-command-number/:commandNumber',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async upsertByCommandNumber(@Param('commandNumber') commandNumber: string, @Req() req: Request) {
		return await this.thirdPartyApiService.upsertByCommandNumber(req.accessToken, req.factoryCode, commandNumber)
	}

	@Api({
		endpoint: 'upsert-by-epc/:epc',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async upsertByEpc(@Param('epc') epc: string, @Req() req: Request) {
		return await this.thirdPartyApiService.upsertByEpc(req.accessToken, req.factoryCode, epc)
	}

	@Get('sync-state')
	@AuthGuard()
	async sendSyncState(@Headers('X-User-Company') factoryCode: string, @Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		Logger.debug(I18nContext.current()?.lang)
		const postMessage = (data) => {
			const parsedData = JSON.parse(data)
			const message = JSON.stringify(
				parsedData.map((item) => ({
					...item,
					name: this.i18nService.t(item.name, { lang: I18nContext.current()?.lang })
				}))
			)

			Logger.debug(message)
			res.write(`data: ${message}\n\n`)
			res.flush()
		}

		await this.ioRedisService.subscribe(`SYNC_DECKER_DATA:${factoryCode}`, postMessage)

		res.on('close', res.end)
	}
}
