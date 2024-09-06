import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtGuard } from '@/modules/auth/guards/jwt.guard'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpStatus,
	Param,
	Patch,
	Post,
	UseGuards,
	UsePipes
} from '@nestjs/common'
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

	@Post()
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(createStorageLocationValidator))
	@UseBaseAPI(HttpStatus.CREATED, { i18nKey: 'common.created' })
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

	@Get(':warehouseCode')
	@UseGuards(JwtGuard)
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getStorageLocationByWarhouse(@Param('warehouseCode') warehouseCode: string) {
		return await this.storageLocationService.findByWarehouse(warehouseCode)
	}

	@Patch(':id')
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(updateStorageLocationValidator))
	@UseBaseAPI(HttpStatus.CREATED, { i18nKey: 'common.updated' })
	async updateStorageLocation(@Param('id') id: string, @Body() payload: CreateStorageLocationDTO) {
		return await this.storageLocationService.updateOneById(+id, payload)
	}

	@Delete()
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(deleteStorageLocationValidator))
	@UseBaseAPI(HttpStatus.NO_CONTENT, { i18nKey: 'common.deleted' })
	async deleteStorageLocation(@Body() payload: DeleteStorageLocationDTO) {
		return await this.storageLocationService.deleteMany(payload.id)
	}
}
