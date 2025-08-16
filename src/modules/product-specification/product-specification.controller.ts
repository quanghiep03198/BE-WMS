import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { Controller, HttpStatus } from '@nestjs/common'
import { ProductSpecificationService } from './product-specification.service'

@Controller('product-specification')
export class ProductSpecificationController {
	constructor(private readonly productSpecificationService: ProductSpecificationService) {}

	@Api({
		endpoint: '',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	// @CacheTTL(60 * 60 * 12) // Cache for 12 hours
	// @UseInterceptors(CacheInterceptor)
	@AuthGuard()
	public async getProductSpecification() {
		return await this.productSpecificationService.getProductSpecification()
	}
}
