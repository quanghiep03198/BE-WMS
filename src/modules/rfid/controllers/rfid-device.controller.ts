import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { UserRole } from '@/modules/user/constants'
import { Body, Controller, Headers, HttpStatus, Param } from '@nestjs/common'
import {
	CreateRFIDDeviceDTO,
	createRFIDDeviceDTO,
	DeleteRFIDDeviceDTO,
	deleteRFIDDeviceDTO,
	updateRFIDDeviceDTO
} from '../dto/rfid-device.dto'
import { RFIDDeviceService } from '../services/rfid-device.service'

@Controller('rfid/devices')
export class RFIDDeviceController {
	constructor(private readonly rfidDeviceService: RFIDDeviceService) {}

	// #region Others
	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async findAllWarehouseDevices(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.rfidDeviceService.findAllWarehouseDevices(factoryCode)
	}

	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@RequireAuthorized(UserRole.MANAGER)
	async createRFIDDevice(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(createRFIDDeviceDTO)) payload: CreateRFIDDeviceDTO,
		@User('username') username: string
	) {
		return await this.rfidDeviceService.createDevice({
			...payload,
			user_code_created: username,
			factory_code: factoryCode
		})
	}

	@RouteHandler({
		endpoint: 'update/:deviceSeriesNumber',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@RequireAuthorized(UserRole.MANAGER)
	async updateRFIDDevice(
		@Param('deviceSeriesNumber') deviceSeriesNumber: string,
		@Body(new ZodValidationPipe(updateRFIDDeviceDTO)) payload: CreateRFIDDeviceDTO,
		@User('username') username: string
	) {
		return await this.rfidDeviceService.updateDevice(deviceSeriesNumber, { ...payload, user_code_updated: username })
	}

	@RouteHandler({
		endpoint: 'delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT
	})
	@RequireAuthorized(UserRole.MANAGER)
	async deleteRFIDDevices(@Body(new ZodValidationPipe(deleteRFIDDeviceDTO)) deviceSeriesNumbers: DeleteRFIDDeviceDTO) {
		return await this.rfidDeviceService.deleteDevicesBySeriesNumbers(deviceSeriesNumbers)
	}
}
