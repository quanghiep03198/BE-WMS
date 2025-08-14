import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { Controller, Get, HttpStatus } from '@nestjs/common'
import { ProductSpecificationService } from './product-specification.service'

@Controller('product-specification')
export class ProductSpecificationController {
	constructor(private readonly productSpecificationService: ProductSpecificationService) {}

	@Get()
	@Api({
		endpoint: '',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	public async getProductSpecification() {
		return await this.productSpecificationService.getProductSpecification()
	}
}
