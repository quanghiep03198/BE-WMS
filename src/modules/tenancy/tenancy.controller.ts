import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
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
}
