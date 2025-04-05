import { Api, HttpMethod } from '@/common/decorators'
import { Controller, Headers } from '@nestjs/common'
import { RFIDSharedService } from '../services/rfid-shared.service'

@Controller('rfid')
export class RFIDSharedController {
	constructor(private readonly rfidSharedService: RFIDSharedService) {}

	// #region Others
	@Api({
		endpoint: 'devices',
		method: HttpMethod.GET
	})
	async getWarehouseRFIDDevices(@Headers('X-User-Company') factoryCode: string) {
		return await this.rfidSharedService.getWarehouseRFIDDevices(factoryCode)
	}
}
