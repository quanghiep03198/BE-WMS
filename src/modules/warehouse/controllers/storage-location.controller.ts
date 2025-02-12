import { Api, AuthGuard } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { BadRequestException, Body, Controller, Headers, HttpStatus, Param } from '@nestjs/common'
import { HttpMethod } from '../../../common/decorators/api.decorator'
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
	constructor(private storageLocationService: StorageLocationService) {}

	@Api({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@AuthGuard()
	async createStorageLocation(
		@Headers('X-User-Company') factoryCode: string,
		@Body(new ZodValidationPipe(createStorageLocationValidator)) payload: CreateStorageLocationDTO
	) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		const data = new StorageLocationEntity({
			...payload,
			cofactory_code: factoryCode
		})
		return await this.storageLocationService.insertOne(data)
	}

	@Api({
		endpoint: ':warehouseCode',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getStorageLocationByWarhouse(
		@Headers('X-User-Company') factoryCode: string,
		@Param('warehouseCode') warehouseCode: string
	) {
		return await this.storageLocationService.findByWarehouse(warehouseCode, factoryCode)
	}

	@Api({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	async updateStorageLocation(
		@Param('id') id: string,
		@Body(new ZodValidationPipe(updateStorageLocationValidator)) payload: CreateStorageLocationDTO
	) {
		return await this.storageLocationService.updateOneById(+id, payload)
	}

	@Api({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	async deleteStorageLocation(
		@Body(new ZodValidationPipe(deleteStorageLocationValidator)) payload: DeleteStorageLocationDTO
	) {
		return await this.storageLocationService.deleteMany(payload.id)
	}
}
