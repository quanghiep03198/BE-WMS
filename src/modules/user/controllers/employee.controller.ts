import { HttpMethod, RouteHandler } from '@/common/decorators'
import { Controller, Query } from '@nestjs/common'
import { EmployeeService } from '../services/employee.service'

@Controller('employee')
export class EmployeeController {
	constructor(private readonly employeeService: EmployeeService) {}

	@RouteHandler({ method: HttpMethod.GET })
	async searchEmployee(@Query('search') searchTerm: string) {
		return await this.employeeService.searchEmployee(searchTerm)
	}
}
