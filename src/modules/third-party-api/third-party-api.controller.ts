import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { InjectQueue } from '@nestjs/bullmq'
import { Controller, Headers, HttpStatus, Param, Req } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { FastifyRequest } from 'fastify'
import { uniqBy } from 'lodash'
import { PaginateModel } from 'mongoose'
import { FALLBACK_VALUE } from '../rfid/constants'
import { EpcDocument, EpcInbound } from '../rfid/schemas/epc.schema'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiService } from './third-party-api.service'

@Controller('third-party-api')
export class ThirdPartyApiController {
	constructor(
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		@InjectModel(EpcInbound.name) private readonly epcModel: PaginateModel<EpcDocument>,
		private readonly thirdPartyApiService: ThirdPartyApiService
	) {}

	@Api({
		endpoint: 'sync-deckers-data',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@AuthGuard()
	async syncDeckerData(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		const validUnknownEpcs = await this.epcModel
			.distinct('epc', {
				mo_no: FALLBACK_VALUE,
				epc: { $regex: /^(?!E28|303429)/ }
			})
			.lean(true)
		return await this.thirdPartyApiSyncQueue.add(
			'SYNC_DECKER_DATA',
			uniqBy(validUnknownEpcs, (item) => item.substring(0, 22)),
			{
				jobId: factoryCode,
				removeOnComplete: true,
				removeOnFail: true
			}
		)
	}

	@Api({
		endpoint: 'upsert-by-command-number/:commandNumber',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async upsertByCommandNumber(@Param('commandNumber') commandNumber: string, @Req() request: FastifyRequest) {
		return await this.thirdPartyApiService.upsertByCommandNumber(
			request.raw[CommonRequestHeader.ACCESS_TOKEN] as string,
			request.raw[CommonRequestHeader.FACTORY_CODE] as string,
			commandNumber
		)
	}

	@Api({
		endpoint: 'upsert-by-epc/:epc',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async upsertByEpc(@Param('epc') epc: string, @Req() request: FastifyRequest) {
		return await this.thirdPartyApiService.upsertByEpc(
			request.raw[CommonRequestHeader.ACCESS_TOKEN] as string,
			request.raw[CommonRequestHeader.FACTORY_CODE] as string,
			epc
		)
	}
}
