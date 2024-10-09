import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Api, HttpMethod } from '@/common/decorators/base-api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Body, Controller, Headers, HttpStatus, Param, UsePipes } from '@nestjs/common'
import {
	CreateWarehouseDTO,
	createWarehouseValidator,
	DeleteWarehouseDTO,
	deleteWarehouseValidator,
	UpdateWarehouseDTO,
	updateWarehouseValidator
} from '../dto/warehouse.dto'
import { WarehouseEntity } from '../entities/warehouse.entity'
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
	@UsePipes(new ZodValidationPipe(createWarehouseValidator))
	async createWarehouse(@Headers('X-User-Company') factoryCode: string, @Body() payload: CreateWarehouseDTO) {
		const data = new WarehouseEntity({ ...payload, cofactory_code: factoryCode })
		return await this.warehouseService.insertOne(data)
	}

	@Api({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(updateWarehouseValidator))
	async updateWarehouse(@Param('id') id: string, @Body() payload: UpdateWarehouseDTO) {
		return await this.warehouseService.updateOneById(+id, payload)
	}

	@Api({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(deleteWarehouseValidator))
	async deleteWarehouses(@Body() payload: DeleteWarehouseDTO) {
		return await this.warehouseService.deleteMany(payload.id)
	}
}
