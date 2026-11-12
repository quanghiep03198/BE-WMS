import { HttpMethod, Public, RequestUser, RequireAuthorized, RouteHandler, TRequestUser } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { UserRole } from '@modules/user/domain/constants'
import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common'
import {
	BulkUpdatePackingWeightDTO,
	bulkUpdatePackingWeightValidator,
	UpdatePackingWeightDTO,
	updatePackingWeightValidator
} from '../dto/update-packing.dto'
import { PackingService } from '../services/packing.service'

@Controller('packing')
export class PackingController {
	constructor(private readonly packingService: PackingService) {}

	@RouteHandler({
		endpoint: 'manifest',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async bulkUpdatePackingWeight(
		@RequestUser() user: TRequestUser,
		@Body(new ZodValidationPipe(bulkUpdatePackingWeightValidator)) payload: BulkUpdatePackingWeightDTO
	) {
		return await this.packingService.bulkUpdatePackingWeight({
			...payload,
			user_code_updated: user.username,
			user_name_updated: user.display_name
		})
	}

	@Public()
	@RouteHandler({
		endpoint: 'weight-list',
		method: HttpMethod.GET
	})
	async getPackingWeightList(@Query('scan_id') scanId: string | null) {
		return await this.packingService.getPackingWeightList(scanId)
	}

	@Public()
	@RouteHandler({
		endpoint: 'weight-list/:scanId',
		method: HttpMethod.GET
	})
	async getOneByScanId(@Param('scanId') scanId: string) {
		return await this.packingService.getOneByScanId(scanId)
	}

	@RouteHandler({
		endpoint: 'update-weight/:scanId',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	async updatePackingWeight(
		@Param('scanId') scanId: string,
		@Body(new ZodValidationPipe(updatePackingWeightValidator)) payload: UpdatePackingWeightDTO
	) {
		return await this.packingService.updatePackingWeight(scanId, payload)
	}
}
