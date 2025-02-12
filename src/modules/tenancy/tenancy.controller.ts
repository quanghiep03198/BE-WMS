import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { BadRequestException, Controller, Headers } from '@nestjs/common'
import { FactoryCode } from '../department/constants'
import { TenancyService } from './tenancy.service'

@Controller('tenants')
export class TenancyController {
	constructor(private readonly tenancyService: TenancyService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	getTenantsByFactory(@Headers('X-User-Company') cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getTenantsByFactory(cofactorCode as FactoryCode)
	}

	@Api({ endpoint: 'default', method: HttpMethod.GET })
	@AuthGuard()
	getDefaultTenantByFactory(@Headers('X-User-Company') cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getDefaultTenantByFactory(cofactorCode as FactoryCode)
	}
}
