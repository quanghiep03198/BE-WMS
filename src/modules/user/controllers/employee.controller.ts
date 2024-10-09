import { Api, HttpMethod } from '@/common/decorators/base-api.decorator'
import { Controller, Query } from '@nestjs/common'
import { EmployeeService } from '../services/employee.service'

@Controller('employee')
export class EmployeeController {
	constructor(private employeeService: EmployeeService) {}

	@Api({ method: HttpMethod.GET })
	async searchEmployee(@Query('search') searchTerm: string) {
		return await this.employeeService.searchEmployee(searchTerm)
	}
}
