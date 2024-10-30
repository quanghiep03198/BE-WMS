import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Body, Controller, HttpStatus, Param, Query, UsePipes } from '@nestjs/common'
import { UpdatePackingWeightDTO, updatePackingWeightValidator } from './dto/update-packing.dto'
import { PackingService } from './packing.service'

@Controller('packing')
export class PackingController {
	constructor(private readonly packingService: PackingService) {}

	@Api({
		endpoint: 'weight-list',
		method: HttpMethod.GET
	})
	async getPackingWeightList(@Query('scan_id') scanId: string | null) {
		return await this.packingService.getPackingWeightList(scanId)
	}

	@Api({
		endpoint: 'weight-list/:scanId',
		method: HttpMethod.GET
	})
	async getOneByScanId(@Param('scanId') scanId: string) {
		return await this.packingService.getOneByScanId(scanId)
	}

	@Api({
		endpoint: 'update-weight/:scanId',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@UsePipes(new ZodValidationPipe(updatePackingWeightValidator))
	async updatePackingWeight(@Param('scanId') scanId: string, @Body() payload: UpdatePackingWeightDTO) {
		return await this.packingService.updatePackingWeight(scanId, payload)
	}
}
