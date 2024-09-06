import { FactoryCodes } from '@/common/constants/global.enum'
import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { BadRequestException, Controller, Get, Headers, HttpStatus, UnprocessableEntityException } from '@nestjs/common'
import { DepartmentService } from './department.service'

@Controller('department')
export class DepartmentController {
	constructor(private departmentService: DepartmentService) {}

	@Get('warehouse')
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getWarehouseDepartments(@Headers('X-User-Company') factoryCode: string) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!Object.values(FactoryCodes).includes) throw new UnprocessableEntityException('Invalid factory code')
		return await this.departmentService.getWarehouseDepartments(factoryCode)
	}
}
