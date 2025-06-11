import { CommonRequestHeader } from '@/common/constants'
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
	getByFactory(@Headers(CommonRequestHeader.FACTORY_CODE) cofactorCode: string) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getByFactory(cofactorCode as FactoryCode)
	}
}
