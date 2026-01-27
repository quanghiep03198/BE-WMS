import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { BadRequestException, Controller, Headers, UnprocessableEntityException } from '@nestjs/common'
import { UserRole } from '../user/constants'
import { FactoryCode } from './constants'
import { DepartmentService } from './department.service'

@Controller('department')
export class DepartmentController {
	constructor(private readonly departmentService: DepartmentService) {}

	@RouteHandler({
		endpoint: 'warehouse',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async getWarehouseDepartments(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!Object.values(FactoryCode).includes) throw new UnprocessableEntityException('Invalid factory code')
		return await this.departmentService.getWarehouseDepartments(factoryCode)
	}

	@RouteHandler({
		endpoint: 'shaping-product-line',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async getShapingDepartment(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.departmentService.getShapingDepartment(factoryCode)
	}

	@RouteHandler({
		endpoint: 'sewing-product-line',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async getSewingDepartment(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.departmentService.getSewingDepartment(factoryCode)
	}
}
