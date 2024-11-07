import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Body, Controller, Headers, HttpStatus, Param } from '@nestjs/common'
import {
	CreateWarehouseDTO,
	createWarehouseValidator,
	DeleteWarehouseDTO,
	deleteWarehouseValidator,
	UpdateWarehouseDTO,
	updateWarehouseValidator
} from '../dto/warehouse.dto'
import { WarehouseService } from '../services/warehouse.service'

@Controller('warehouse')
export class WarehouseController {
	constructor(private warehouseService: WarehouseService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	async getWarehouses(@Headers('X-User-Company') cofactorCode: string) {
		return await this.warehouseService.findAllByFactory(cofactorCode)
	}

	@Api({
		endpoint: ':warehouseCode',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOneByWarehouseCode(@Param('warehouseCode') cofactorCode: string) {
		return await this.warehouseService.findOneByWarehouseCode(cofactorCode)
	}

	@Api({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@AuthGuard()
	async createWarehouse(
		@Headers('X-User-Company') factoryCode: string,
		@Body(new ZodValidationPipe(createWarehouseValidator)) payload: CreateWarehouseDTO
	) {
		return await this.warehouseService.insertOne({ ...payload, cofactory_code: factoryCode } as any)
	}

	@Api({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	async updateWarehouse(
		@Param('id') id: string,
		@Body(new ZodValidationPipe(updateWarehouseValidator)) payload: UpdateWarehouseDTO
	) {
		return await this.warehouseService.updateOneById(+id, payload)
	}

	@Api({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	async deleteWarehouses(@Body(new ZodValidationPipe(deleteWarehouseValidator)) payload: DeleteWarehouseDTO) {
		return await this.warehouseService.deleteMany(payload.id)
	}
}
