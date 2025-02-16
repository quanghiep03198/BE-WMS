import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { BadRequestException, Controller, Headers } from '@nestjs/common'
import { FactoryCode } from '../department/constants'
import { TenancyService } from './tenancy.service'

@Controller('tenants')
export class TenancyController {
	constructor(private readonly tenancyService: TenancyService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	getAll() {
		return this.tenancyService.getAll()
	}
	@Api({ endpoint: 'by-factory', method: HttpMethod.GET })
	@AuthGuard()
	getByFactory(@Headers('X-User-Company') cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getByFactory(cofactorCode as FactoryCode)
	}

	/**
	 * @deprecated
	 */
	@Api({ endpoint: 'default', method: HttpMethod.GET })
	@AuthGuard()
	getDefaultTenantByFactory(@Headers('X-User-Company') cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getDefaultTenantByFactory(cofactorCode as FactoryCode)
	}
}
