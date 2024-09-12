import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { Controller, Get, HttpStatus, Query } from '@nestjs/common'
import { EmployeeService } from '../services/employee.service'

@Controller('employee')
export class EmployeeController {
	constructor(private employeeService: EmployeeService) {}

	@Get()
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async searchEmployee(@Query('search') searchTerm: string) {
		return await this.employeeService.searchEmployee(searchTerm)
	}
}
