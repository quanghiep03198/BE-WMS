import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { Controller, Query } from '@nestjs/common'
import { EmployeeService } from '../services/employee.service'

@Controller('employee')
export class EmployeeController {
	constructor(private readonly employeeService: EmployeeService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	async searchEmployee(@Query('search') searchTerm: string) {
		return await this.employeeService.searchEmployee(searchTerm)
	}
}
