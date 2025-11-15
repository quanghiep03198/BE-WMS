import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, HttpStatus, Param, ParseBoolPipe, ParseIntPipe, Query } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DeleteManyByIdsDTO, deleteManyByIdsDTO } from '../_base/dto/base.dto'
import { UserEntity } from '../user/entities/user.entity'
import {
	CreateDeliveryDTO,
	createDeliveryDTO,
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
		@Body(new ZodValidationPipe(createDeliveryDTO)) payload: CreateDeliveryDTO
	) {
		this.logger.debug(user)
		return await this.deliveryService.insertMany(
			payload.map((item) => ({ ...item, user_code_created: user?.username }))
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
		endpoint: 'delete-multiple',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
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
	@AuthGuard()
	async restoreMany(@Body('ids') ids: number[]) {
		return await this.deliveryService.restoreManyByIds(ids)
	}
}
