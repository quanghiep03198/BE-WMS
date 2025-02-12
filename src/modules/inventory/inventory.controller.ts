import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Controller, DefaultValuePipe, Headers, Query } from '@nestjs/common'
import { format } from 'date-fns'
import { SearchInventoryQueryDTO, searchInventoryQueryValidator } from './dto/inventory.dto'
import { InventoryService } from './inventory.service'

@Controller('inventory')
export class InventoryController {
	constructor(private readonly inventoryService: InventoryService) {}

	@Api({
		endpoint: '/monthly-inoutbound',
		method: HttpMethod.GET
	})
	@AuthGuard()
	findAll(
		@Headers('X-User-Company') factoryCode: string,
		@Query(
			new ZodValidationPipe(searchInventoryQueryValidator),
			new DefaultValuePipe({ 'month.eq': format(new Date(), 'yyyy-MM') })
		)
		searchTerms: SearchInventoryQueryDTO
	) {
		return this.inventoryService.findByMonth({ ['factory_code.eq']: factoryCode, ...searchTerms })
	}
}
