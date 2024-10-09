import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Api, HttpMethod } from '@/common/decorators/base-api.decorator'
import { BadRequestException, Controller, Headers } from '@nestjs/common'
import { TenancyService } from './tenancy.service'

@Controller('tenants')
export class TenancyController {
	constructor(private readonly tenancyService: TenancyService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	getTenantsByFactory(@Headers('X-User-Company') cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getTenantsByFactory(cofactorCode)
	}
}
