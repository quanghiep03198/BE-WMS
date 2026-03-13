import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { UserRole } from '@/modules/user/constants'
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
	constructor(private readonly warehouseService: WarehouseService) {}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getWarehouses(@Headers(CommonRequestHeader.FACTORY_CODE) cofactorCode: string) {
		return await this.warehouseService.findAllByFactory(cofactorCode)
	}

	@RouteHandler({
		endpoint: ':warehouseCode',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getOneByWarehouseCode(@Param('warehouseCode') cofactorCode: string) {
		return await this.warehouseService.findOneByWarehouseCode(cofactorCode)
	}

	@RouteHandler({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async createWarehouse(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(createWarehouseValidator)) payload: CreateWarehouseDTO
	) {
		return await this.warehouseService.insertOne({ ...payload, cofactory_code: factoryCode } as any)
	}

	@RouteHandler({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async updateWarehouse(
		@Param('id') id: string,
		@Body(new ZodValidationPipe(updateWarehouseValidator)) payload: UpdateWarehouseDTO
	) {
		return await this.warehouseService.updateOneById(+id, payload)
	}

	@RouteHandler({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@RequireAuthorized(UserRole.MANAGER)
	async deleteWarehouses(@Body(new ZodValidationPipe(deleteWarehouseValidator)) payload: DeleteWarehouseDTO) {
		return await this.warehouseService.deleteMany(payload.id)
	}
}
