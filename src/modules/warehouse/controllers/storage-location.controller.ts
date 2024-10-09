import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Api } from '@/common/decorators/base-api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { BadRequestException, Body, Controller, Headers, HttpStatus, Param, UsePipes } from '@nestjs/common'
import {
	CreateStorageLocationDTO,
	createStorageLocationValidator,
	DeleteStorageLocationDTO,
	deleteStorageLocationValidator,
	updateStorageLocationValidator
} from '../dto/storage-location.dto'
import { StorageLocationEntity } from '../entities/storage-location.entity'
import { HttpMethod } from './../../../common/decorators/base-api.decorator'
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
	@UsePipes(new ZodValidationPipe(createStorageLocationValidator))
	async createStorageLocation(
		@Headers('X-User-Company') factoryCode: string,
		@Body() payload: CreateStorageLocationDTO
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
	@UsePipes(new ZodValidationPipe(updateStorageLocationValidator))
	async updateStorageLocation(@Param('id') id: string, @Body() payload: CreateStorageLocationDTO) {
		return await this.storageLocationService.updateOneById(+id, payload)
	}

	@Api({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(deleteStorageLocationValidator))
	async deleteStorageLocation(@Body() payload: DeleteStorageLocationDTO) {
		return await this.storageLocationService.deleteMany(payload.id)
	}
}
