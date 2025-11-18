import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, Headers, HttpStatus, Param, ParseIntPipe } from '@nestjs/common'
import { pick } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FactoryAgencyCode } from '../department/constants'
import { UserEntity } from '../user/entities/user.entity'
import { TruckloadDeliveryStatus } from './constants'
import {
	CreateDeliveryDTO,
	createDeliveryDTO,
	SetDeliveryStatusDTO,
	setDeliveryStatusDTO,
	updateDeliveryDTO,
	UpdateDeliveryDTO
} from './dto/truckload-delivery.dto'
import { DeliveryService } from './truckload-delivery.service'

@Controller('truckload-delivery')
export class TruckloadDeliveryController {
	constructor(
		@InjectPinoLogger(TruckloadDeliveryController.name) private readonly logger: PinoLogger,
		private readonly deliveryService: DeliveryService
	) {}

	@Api({
		method: HttpMethod.GET,
		message: 'common.ok'
	})
	@AuthGuard()
	async getAll() {
		return await this.deliveryService.findAll()
	}

	@Api({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@AuthGuard()
	async insertMany(
		@User() user: UserEntity,
		@Headers(CommonRequestHeader.FACTORY_CODE) factory_code: string,
		@Body(new ZodValidationPipe(createDeliveryDTO)) payload: CreateDeliveryDTO
	) {
		const nextDispatchCode = await this.deliveryService.generateDispatchCode(FactoryAgencyCode[factory_code])
		return await this.deliveryService.insertMany(
			payload.outbound_purchase_orders.map((item) => ({
				...pick(payload, ['license_plate', 'container_number']),
				...item,
				dispatch_order: nextDispatchCode,
				factory_code,
				user_code_created: user?.username
			}))
		)
	}

	@Api({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.OK,
		message: 'common.created'
	})
	@AuthGuard()
	async updateOne(
		@Param('id', new ParseIntPipe()) id: number,
		@Body(new ZodValidationPipe(updateDeliveryDTO)) payload: UpdateDeliveryDTO
	) {
		this.logger.debug(payload)
		return await this.deliveryService.updateOneById(id, payload)
	}

	@Api({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE
	})
	@AuthGuard()
	async deleteOne(
		@Param('id', ParseIntPipe) id: number
		// @Query('permanantly', ParseBoolPipe) permanently?: true
	) {
		return await this.deliveryService.deleteOneById(id)
		// else return await this.deliveryService.softDeleteOneById(id)
	}

	@Api({
		endpoint: 'set-status/:id',
		method: HttpMethod.PATCH,
		message: 'common.ok'
	})
	async restoreOne(
		@Param('id', ParseIntPipe) id: number,
		@Body(new ZodValidationPipe(setDeliveryStatusDTO)) payload: SetDeliveryStatusDTO
	) {
		return await this.deliveryService.updateOneById(id, {
			status: payload.status,
			...(payload.status === TruckloadDeliveryStatus.CONFIRMED && { factory_departure_time: new Date() })
		})
	}
}
