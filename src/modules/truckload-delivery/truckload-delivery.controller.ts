import { Api, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, HttpStatus, Param, ParseBoolPipe, ParseIntPipe, Query } from '@nestjs/common'
import { DeleteManyByIdsDTO, deleteManyByIdsDTO } from '../_base/dto/base.dto'
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
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async insertOne(@Body(new ZodValidationPipe(createDeliveryDTO)) payload: CreateDeliveryDTO) {
		return await this.deliveryService.insertOne(payload)
	}

	@Api({
		endpoint: 'update/:id',
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
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE
	})
	async deleteOne(@Param('id', ParseIntPipe) id: number, @Query('permanantly', ParseBoolPipe) permanently?: true) {
		if (permanently) return await this.deliveryService.deleteOneById(id)
		else return await this.deliveryService.softDeleteOneById(id)
	}

	@Api({
		endpoint: 'delete-multiple',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	async deleteMany(
		@Body('ids', new ZodValidationPipe(deleteManyByIdsDTO)) ids: DeleteManyByIdsDTO,
		@Query('permanantly', ParseBoolPipe) permanently?: true
	) {
		if (permanently) return await this.deliveryService.deleteManyByIds(ids)
		else return await this.deliveryService.softDeleteManyByIds(ids)
	}

	@Api({
		endpoint: 'restore/:id',
		method: HttpMethod.POST,
		message: 'common.ok'
	})
	async restoreOne(@Param('id', ParseIntPipe) id: number) {
		return await this.deliveryService.restoreOneById(id)
	}

	@Api({
		endpoint: 'restore-multiple',
		method: HttpMethod.POST,
		statusCode: HttpStatus.OK,
		message: 'common.ok'
	})
	async restoreMany(@Body('ids') ids: number[]) {
		return await this.deliveryService.restoreManyByIds(ids)
	}
}
