import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Api, HttpMethod } from '@/common/decorators/base-api.decorator'
import { BadRequestException, Controller, Headers, UnprocessableEntityException } from '@nestjs/common'
import { FactoryCode } from './constants'
import { DepartmentService } from './department.service'

@Controller('department')
export class DepartmentController {
	constructor(private departmentService: DepartmentService) {}

	@Api({
		endpoint: 'warehouse',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getWarehouseDepartments(@Headers('X-User-Company') factoryCode: string) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!Object.values(FactoryCode).includes) throw new UnprocessableEntityException('Invalid factory code')
		return await this.departmentService.getWarehouseDepartments(factoryCode)
	}

	@Api({
		endpoint: 'shaping-product-line',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getShapingDepartment(@Headers('X-User-Company') factoryCode: string) {
		return await this.departmentService.getShapingDepartment(factoryCode)
	}
}
