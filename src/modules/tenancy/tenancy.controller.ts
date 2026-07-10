import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthenticated, RouteHandler } from '@common/decorators'
import { BadRequestException, Controller, Headers } from '@nestjs/common'
import { FactoryCode } from '../department/constants'
import { TenancyService } from './tenancy.service'

@Controller('tenants')
export class TenancyController {
	constructor(private readonly tenancyService: TenancyService) {}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthenticated()
	getAll() {
		return this.tenancyService.getAll()
	}

	@RouteHandler({ endpoint: 'by-factory', method: HttpMethod.GET })
	@RequireAuthenticated()
	getByFactory(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: FactoryCode) {
		if (!factoryCode) throw new BadRequestException('Please provide factory code')
		return this.tenancyService.getByFactory(factoryCode)
	}
}
