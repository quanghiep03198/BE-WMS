import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, Public, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, Headers, HttpStatus, Param, Query, Res } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { UserRole } from '../user/constants'
import {
	BulkUpdatePackingWeightDTO,
	bulkUpdatePackingWeightValidator,
	UpdatePackingWeightDTO,
	updatePackingWeightValidator
} from './dto/update-packing.dto'
import { PackingService } from './packing.service'

@Controller('packing')
export class PackingController {
	constructor(private readonly packingService: PackingService) {}

	@RouteHandler({
		endpoint: 'manifest',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getPackingManifest(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.packingService.getPackingManifest(factoryCode)
	}

	@RouteHandler({
		endpoint: 'manifest',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async bulkUpdatePackingWeight(
		@Body(new ZodValidationPipe(bulkUpdatePackingWeightValidator)) payload: BulkUpdatePackingWeightDTO
	) {
		return await this.packingService.bulkUpdatePackingWeight(payload)
	}

	@RouteHandler({
		endpoint: 'manifest/export',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exportPackingManifest(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() res: FastifyReply
	) {
		const buffer = await this.packingService.exportPackingManifestToExcel(factoryCode)
		return res.send(buffer)
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
