import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager'
import { Controller, HttpStatus, UseInterceptors } from '@nestjs/common'
import { UserRole } from '../user/constants'
import { ProductSpecificationService } from './product-specification.service'

@Controller('product-specification')
export class ProductSpecificationController {
	constructor(private readonly productSpecificationService: ProductSpecificationService) {}

	@RouteHandler({
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.DG_WAREHOUSE_STAFF)
	@CacheKey('cached:apis:product_specification')
	@CacheTTL(60 * 1000 * 60 * 24 * 7)
	@UseInterceptors(CacheInterceptor)
	public async getProductSpecification() {
		return await this.productSpecificationService.getProductSpecification()
	}
}
