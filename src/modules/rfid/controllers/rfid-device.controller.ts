import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, Headers, HttpStatus, Param } from '@nestjs/common'
import { CreateRFIDDeviceDTO, createRFIDDeviceDTO, updateRFIDDeviceDTO } from '../dto/rfid-reader.dto'
import { RFIDReaderService } from '../services/rfid-reader.service'

@Controller('rfid/devices')
export class RFIDDeviceController {
	constructor(private readonly rfidDeviceService: RFIDReaderService) {}

	// #region Others
	@Api({
		method: HttpMethod.GET
	})
	@AuthGuard()
	async findAllWarehouseDevices(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.rfidDeviceService.findAllWarehouseDevices(factoryCode)
	}

	@Api({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
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
	@Api({
		endpoint: 'update/:deviceSeriesNumber',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	async updateRFIDDevice(
		@Param('deviceSeriesNumber') deviceSeriesNumber: string,
		@Body(new ZodValidationPipe(updateRFIDDeviceDTO)) payload: CreateRFIDDeviceDTO,
		@User('username') username: string
	) {
		return await this.rfidDeviceService.updateDevice(deviceSeriesNumber, { ...payload, user_code_updated: username })
	}

	@Api({
		endpoint: 'delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT
	})
	@AuthGuard()
	async deleteRFIDDevices(@Body() deviceSeriesNumbers: string[]) {
		return await this.rfidDeviceService.deleteDevicesBySeriesNumbers(deviceSeriesNumbers)
	}
}
