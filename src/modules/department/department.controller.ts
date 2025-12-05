import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { BadRequestException, Controller, Headers, UnprocessableEntityException } from '@nestjs/common'
import { FactoryCode } from './constants'
import { DepartmentService } from './department.service'

@Controller('department')
export class DepartmentController {
	constructor(private readonly departmentService: DepartmentService) {}

	@Api({
		endpoint: 'warehouse',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getWarehouseDepartments(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!Object.values(FactoryCode).includes) throw new UnprocessableEntityException('Invalid factory code')
		return await this.departmentService.getWarehouseDepartments(factoryCode)
	}

	@Api({
		endpoint: 'shaping-product-line',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getShapingDepartment(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.departmentService.getShapingDepartment(factoryCode)
	}

	@Api({
		endpoint: 'sewing-product-line',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getSewingDepartment(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.departmentService.getSewingDepartment(factoryCode)
	}
}
