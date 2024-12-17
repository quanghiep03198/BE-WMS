import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { Controller, HttpStatus, Param } from '@nestjs/common'
import { ThirdPartyApiService } from './third-party-api.service'

@Controller('third-party-api')
export class ThirdPartyApiController {
	constructor(private readonly thirdPartyApiService: ThirdPartyApiService) {}

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
