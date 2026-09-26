import { HttpMethod, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import {
	IRFIDDeviceRepository,
	RFID_DEVICE_REPOSITORY
} from '@modules/rfid-device/application/ports/rfid-device.repository.port'
import {
	CREATED_RFID_DEVICE_EVENT,
	CreatedRFIDDeviceEvent
} from '@modules/rfid-device/domain/events/created-rfid-device.event'
import {
	DELETED_RFID_DEVICES_EVENT,
	DeletedRFIDDevicesEvent
} from '@modules/rfid-device/domain/events/deleted-rfid-devices.event'
import {
	UPDATED_RFID_DEVICE_EVENT,
	UpdatedRFIDDeviceEvent
} from '@modules/rfid-device/domain/events/updated-rfid-device.event'
import { UserRole } from '@modules/user/domain/constants'
import { Body, Controller, HttpStatus, Inject, Param } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ParseObjectIdPipe } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import {
	CreateRFIDDeviceDTO,
	createRFIDDeviceValidator,
	DeleteRFIDDeviceDTO,
	deleteRFIDDeviceValidator,
	UpdateRFIDDeviceDTO,
	updateRFIDDeviceValidator
} from '../../application/dto/rfid-device.dto'

@Controller('rfid/devices')
export class RFIDDeviceController {
	constructor(
		@Inject(RFID_DEVICE_REPOSITORY)
		private readonly rfidDeviceRepository: IRFIDDeviceRepository,
		private readonly eventEmitter: EventEmitter2
	) {}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getAll() {
		return await this.rfidDeviceRepository.findAll()
	}

	@RouteHandler({ endpoint: ':deviceSn', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOneByDeviceSn(@Param('deviceSn') deviceSn: string) {
		return await this.rfidDeviceRepository.findOneByDeviceSn(deviceSn)
	}

	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@RequireAuthorized(UserRole.MANAGER)
	async createRFIDDevice(
		@Body(new ZodValidationPipe(createRFIDDeviceValidator)) payload: CreateRFIDDeviceDTO,
		@User('username') username: string
	) {
		const createdDevice = await this.rfidDeviceRepository.createOne({ ...payload, created_by: username })
		this.eventEmitter.emit(
			CREATED_RFID_DEVICE_EVENT,
			new CreatedRFIDDeviceEvent(
				payload.device_sn,
				payload.device_name,
				payload.station_no,
				payload.tcp_ip,
				payload.device_type,
				username
			)
		)

		return createdDevice
	}

	@RouteHandler({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthorized(UserRole.MANAGER)
	async updateRFIDDevice(
		@Param('id', ParseObjectIdPipe) id: Types.ObjectId,
		@Body(new ZodValidationPipe(updateRFIDDeviceValidator)) payload: UpdateRFIDDeviceDTO,
		@User('username') username: string
	) {
		const { prev, update } = await this.rfidDeviceRepository.findOneAndUpdate(id, {
			...payload,
			updated_by: username
		})
		this.eventEmitter.emit(
			UPDATED_RFID_DEVICE_EVENT,
			new UpdatedRFIDDeviceEvent(
				update.device_sn,
				{ name: prev.device_name, station_no: prev.station_no, tcp_ip: prev.tcp_ip, type: prev.device_type },
				{
					name: payload.device_name ?? update.device_name,
					station_no: payload.station_no ?? update.station_no,
					tcp_ip: payload.tcp_ip ?? update.tcp_ip,
					type: payload.device_type ?? update.device_type,
					updated_by: username
				}
			)
		)

		return update
	}

	@RouteHandler({
		endpoint: 'delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@RequireAuthorized(UserRole.MANAGER)
	async deleteRFIDDevices(@Body(new ZodValidationPipe(deleteRFIDDeviceValidator)) payload: DeleteRFIDDeviceDTO) {
		const deletedDeviceSns = await this.rfidDeviceRepository.deleteMany(payload.ids)
		this.eventEmitter.emit(DELETED_RFID_DEVICES_EVENT, new DeletedRFIDDevicesEvent(deletedDeviceSns))
	}
}
