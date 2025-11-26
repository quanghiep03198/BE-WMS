import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, Headers, HttpStatus, Param, ParseIntPipe } from '@nestjs/common'
import { pick } from 'lodash'
import { FactoryAgencyCode } from '../department/constants'
import { UserEntity } from '../user/entities/user.entity'
import {
	CreateDeliveryDTO,
	createDeliveryDTO,
	updateDeliveryDTO,
	UpdateDeliveryDTO,
	UpdateDispatchOrderStatusDTO,
	updateDispatchOrderStatusDTO,
	UpsertPurchaseOrdersDTO,
	upsertPurchaseOrdersDTO
} from './dto/truckload-delivery.dto'
import { TruckloadDeliveryService } from './truckload-delivery.service'

@Controller('truckload-delivery')
export class TruckloadDeliveryController {
	constructor(private readonly deliveryService: TruckloadDeliveryService) {}

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
		const nextDispatchCode = await this.deliveryService.getNextDispatchOrder(FactoryAgencyCode[factory_code])
		return await this.deliveryService.insertMany(
			payload.outbound_purchase_orders.map((item) => ({
				...pick(payload, ['license_plate', 'container_number']),
				...item,
				dispatch_order: nextDispatchCode,
				factory_code,
				user_code_created: user?.username,
				user_name_created: user?.username
			}))
		)
	}

	@Api({
		endpoint: 'bulk-update/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async bulkUpdateByDispatchOrder(
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateDeliveryDTO)) payload: UpdateDeliveryDTO
	) {
		return await this.deliveryService.bulkUpdateByDispatchOrder(dispatchOrder, payload)
	}
	@Api({
		endpoint: 'upsert-purchase-orders/:dispatchOrder',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async upsertPurchaseOrders(
		@Param('dispatchOrder') dispatchOrder: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factory_code: string,
		@User() user: Partial<UserEntity>,
		@Body(new ZodValidationPipe(upsertPurchaseOrdersDTO)) payload: UpsertPurchaseOrdersDTO
	) {
		return await this.deliveryService.upsertPurchaseOrderDeliveries(
			dispatchOrder,
			payload.map((item) => ({
				...item,
				factory_code,
				user_code_created: user?.username,
				user_code_updated: user?.username
			}))
		)
	}

	@Api({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteOne(@Param('id', ParseIntPipe) id: number) {
		return await this.deliveryService.deleteOneById(id)
	}

	@Api({
		endpoint: 'bulk-delete/:dispatchOrder',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async bulkDelete(@Param('dispatchOrder') dispatchOrder: string) {
		return await this.deliveryService.bulkDeleteByDispatchOrder(dispatchOrder)
	}

	@Api({
		endpoint: 'set-status/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok'
	})
	@AuthGuard()
	async updateDispatchOrderStatus(
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateDispatchOrderStatusDTO)) payload: UpdateDispatchOrderStatusDTO
	) {
		return await this.deliveryService.updateDispatchOrderStatus(dispatchOrder, payload)
	}
}
