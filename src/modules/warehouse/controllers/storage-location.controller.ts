import { CommonRequestHeader } from '@common/constants'
import { RequireAuthorized, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { UserRole } from '@modules/user/constants'
import { BadRequestException, Body, Controller, Headers, HttpStatus, Param } from '@nestjs/common'
import { HttpMethod } from '../../../common/decorators/route-handler.decorator'
import {
	CreateStorageLocationDTO,
	createStorageLocationValidator,
	DeleteStorageLocationDTO,
	deleteStorageLocationValidator,
	updateStorageLocationValidator
} from '../dto/storage-location.dto'
import { StorageLocationEntity } from '../entities/storage-location.entity'
import { StorageLocationService } from './../services/storage-location.service'

@Controller('warehouse/storage-detail')
export class StorageLocationController {
	constructor(private readonly storageLocationService: StorageLocationService) {}

	@RouteHandler({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async createStorageLocation(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(createStorageLocationValidator)) payload: CreateStorageLocationDTO
	) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		const data = new StorageLocationEntity({
			...payload,
			cofactory_code: factoryCode
		})
		return await this.storageLocationService.insertOne(data)
	}

	@RouteHandler({
		endpoint: ':warehouseCode',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getStorageLocationByWarhouse(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Param('warehouseCode') warehouseCode: string
	) {
		return await this.storageLocationService.findByWarehouse(warehouseCode, factoryCode)
	}

	@RouteHandler({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	async updateStorageLocation(
		@Param('id') id: string,
		@Body(new ZodValidationPipe(updateStorageLocationValidator)) payload: CreateStorageLocationDTO
	) {
		return await this.storageLocationService.updateOneById(+id, payload)
	}

	@RouteHandler({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	async deleteStorageLocation(
		@Body(new ZodValidationPipe(deleteStorageLocationValidator)) payload: DeleteStorageLocationDTO
	) {
		return await this.storageLocationService.deleteMany(payload.id)
	}
}
