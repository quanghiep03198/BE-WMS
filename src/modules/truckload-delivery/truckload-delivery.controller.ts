import { Api, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, HttpStatus, Param, ParseIntPipe } from '@nestjs/common'
import {
	CreateDeliveryDTO,
	createDeliveryDTO,
	updateDeliveryDTO,
	UpdateDeliveryDTO
} from './dto/truckload-delivery.dto'
import { DeliveryService } from './truckload-delivery.service'

@Controller('truckload-delivery')
export class TruckloadDeliveryController {
	constructor(private readonly deliveryService: DeliveryService) {}

	@Api({
		method: HttpMethod.GET,
		message: 'common.ok'
	})
	async getAll() {
		return await this.deliveryService.findAll()
	}

	@Api({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async insertOne(@Body(new ZodValidationPipe(createDeliveryDTO)) payload: CreateDeliveryDTO) {
		return await this.deliveryService.insertOne(payload)
	}

	@Api({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.OK,
		message: 'common.created'
	})
	async updateOne(
		@Param('id', new ParseIntPipe()) id: number,
		@Body(new ZodValidationPipe(updateDeliveryDTO)) payload: UpdateDeliveryDTO
	) {
		return await this.deliveryService.updateOneById(id, payload)
	}

	@Api({
		endpoint: ':id',
		method: HttpMethod.DELETE
	})
	async deleteOne(@Param('id', ParseIntPipe) id: number) {
		return await this.deliveryService.softDeleteOneById(id)
	}

	@Api({
		endpoint: 'restore/:id',
		method: HttpMethod.PATCH,
		message: 'common.ok'
	})
	async restoreOne(@Param('id', ParseIntPipe) id: number) {
		return await this.deliveryService.restoreById(id)
	}
}
