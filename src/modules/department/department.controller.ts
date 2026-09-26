import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { UserRole } from '@modules/user/domain/constants'
import { BadRequestException, Controller, Headers, UnprocessableEntityException } from '@nestjs/common'
import { FactoryCodeRef } from '../../common/constants/factory'
import { DepartmentService } from './department.service'

@Controller('department')
export class DepartmentController {
	constructor(private readonly departmentService: DepartmentService) {}

	@RouteHandler({
		endpoint: 'warehouse',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getWarehouseDepartments(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!Object.values(FactoryCodeRef).includes) throw new UnprocessableEntityException('Invalid factory code')
		return await this.departmentService.getWarehouseDepartments(factoryCode)
	}

	@RouteHandler({
		endpoint: 'assembly',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getShapingDepartment(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.departmentService.getAssemblyDepartments(factoryCode)
	}

	@RouteHandler({
		endpoint: 'sewing',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getSewingDepartment(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.departmentService.getSewingDepartments(factoryCode)
	}
}
