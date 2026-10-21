import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { UserRole } from '@modules/user/domain/constants'
import { Controller, Inject } from '@nestjs/common'
import { DEPARTMENT_REPOSITORY, IDepartmentRepository } from './department.repository.interface'

@Controller('department')
export class DepartmentController {
	constructor(@Inject(DEPARTMENT_REPOSITORY) private readonly departmentRepository: IDepartmentRepository) {}

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
	async getShapingDepartment() {
		return await this.departmentRepository.getAssemblyDepartments()
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
	async getSewingDepartment() {
		return await this.departmentRepository.getSewingDepartments()
	}
}
