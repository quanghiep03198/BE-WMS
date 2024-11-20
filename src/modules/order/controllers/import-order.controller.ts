import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Body, Controller, Headers, HttpStatus } from '@nestjs/common'
import { DeleteTransferOrderDTO } from '../dto/transfer-order.dto'
import { ImportOrderService } from '../services/import-order.service'

@Controller('order/production-import')
export class ImportOrderController {
	constructor(private readonly importOrderService: ImportOrderService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	async getImportOrderByFactory(@Headers('X-User-Company') factoryCode: string) {
		return await this.importOrderService.getImportOrderByFactory(factoryCode)
	}

	@Api({ method: HttpMethod.GET, endpoint: 'get-data-import' })
	@AuthGuard()
	async getDataImport(@Headers('X-User-Company') factoryCode: string) {
		return await this.importOrderService.getDataImport(factoryCode)
	}

	@Api({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	async deleteTransferOrder(@Body() payload: DeleteTransferOrderDTO) {
		return await this.importOrderService.deleteImportData(payload)
	}

	@Api({ method: HttpMethod.POST, statusCode: HttpStatus.CREATED, message: 'common.created' })
	@AuthGuard()
	async store(@Body() storeImportOrderDto: any, @Headers('X-User-Company') companyCode: string) {
		return await this.importOrderService.store(companyCode, storeImportOrderDto)
	}
}
