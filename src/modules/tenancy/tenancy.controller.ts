import { UseAuth } from '@/common/decorators/auth.decorator'
import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { BadRequestException, Controller, Get, Headers, HttpStatus } from '@nestjs/common'
import { TenancyService } from './tenancy.service'

@Controller('tenants')
export class TenancyController {
	constructor(private readonly tenancyService: TenancyService) {}

	@Get()
	@UseAuth()
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	getTenantsByFactory(@Headers('X-User-Company') cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getTenantsByFactory(cofactorCode)
	}
}
