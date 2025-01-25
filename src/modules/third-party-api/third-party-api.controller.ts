import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { InjectQueue } from '@nestjs/bullmq'
import { Controller, HttpStatus, Param } from '@nestjs/common'
import { Queue } from 'bullmq'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiService } from './third-party-api.service'

@Controller('third-party-api')
export class ThirdPartyApiController {
	constructor(
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		private readonly thirdPartyApiService: ThirdPartyApiService
	) {}

	@Api({
		endpoint: 'upsert-by-command-number/:commandNumber',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async upsertByCommandNumber(@Param('commandNumber') commandNumber: string) {
		return await this.thirdPartyApiService.upsertByCommandNumber(commandNumber)
	}

	@Api({
		endpoint: 'upsert-by-epc/:epc',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async upsertByEpc(@Param('epc') epc: string) {
		return await this.thirdPartyApiService.upsertByEpc(epc)
	}
}
