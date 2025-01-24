import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { InjectQueue } from '@nestjs/bullmq'
import { Controller, Headers, HttpStatus, Param } from '@nestjs/common'
import { Queue } from 'bullmq'
import { FALLBACK_VALUE } from '../rfid/constants'
import { RFIDDataService } from '../rfid/rfid.data.service'
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

	@Api({
		endpoint: 'background-sync',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async triggerSync(@Headers('X-User-Company') factoryCode: string, @Headers('X-Tenant-Id') tenantId: string) {
		const scannedEpcs = RFIDDataService.getScannedEpcs(tenantId)
		const validUnknownEpcs = scannedEpcs
			.filter((item) => item.mo_no === FALLBACK_VALUE && !item.epc.startsWith('E28'))
			.map((item) => item.epc)
		return await this.thirdPartyApiSyncQueue.add(factoryCode, validUnknownEpcs, { jobId: tenantId })
	}
}
