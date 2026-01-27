import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RouteHandler } from '@/common/decorators'
import { BadRequestException, Controller, Headers } from '@nestjs/common'
import { FactoryCode } from '../department/constants'
import { TenancyService } from './tenancy.service'

@Controller('tenants')
export class TenancyController {
	constructor(private readonly tenancyService: TenancyService) {}

	@RouteHandler({ method: HttpMethod.GET })
	getAll() {
		return this.tenancyService.getAll()
	}

	@RouteHandler({ endpoint: 'by-factory', method: HttpMethod.GET })
	getByFactory(@Headers(CommonRequestHeader.FACTORY_CODE) cofactorCode: FactoryCode) {
		if (!cofactorCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getByFactory(cofactorCode)
	}
}
