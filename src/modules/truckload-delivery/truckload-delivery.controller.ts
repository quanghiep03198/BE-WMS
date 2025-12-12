import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, Get, Headers, HttpStatus, Param, ParseIntPipe, Query, Res, UseFilters } from '@nestjs/common'

import { type FastifyReply } from 'fastify'
import { pick } from 'lodash'
import { FactoryAgencyCode } from '../department/constants'
import { UserEntity } from '../user/entities/user.entity'
import {
	CreateDeliveryDTO,
	createDeliveryDTO,
	filterQueryDTO,
	FilterQueryDTO,
	UpdateContainerConditionDTO,
	updateContainerConditionDTO,
	updateDeliveryDTO,
	UpdateDeliveryDTO,
	UpdateSignatureDTO,
	updateSignatureDTO,
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
	async getAll(@Query(new ZodValidationPipe(filterQueryDTO)) filterQueryDTO: FilterQueryDTO) {
		return await this.deliveryService.getDispatchOrders(filterQueryDTO)
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
		@User() user: UserEntity,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateDeliveryDTO)) payload: UpdateDeliveryDTO
	) {
		return await this.deliveryService.bulkUpdateByDispatchOrder(dispatchOrder, {
			...payload,
			user_code_updated: user?.username,
			user_name_updated: user?.username
		})
	}
	@Api({
		endpoint: 'upsert-purchase-orders/:dispatchOrder',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async upsertPurchaseOrders(
		@User() user: Partial<UserEntity>,
		@Param('dispatchOrder') dispatchOrder: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factory_code: string,
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
		endpoint: 'update-signature/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok'
	})
	@AuthGuard()
	async updateDispatchOrderStatus(
		@User() user: Partial<UserEntity>,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateSignatureDTO)) payload: UpdateSignatureDTO
	) {
		return await this.deliveryService.updateDispatchOrderSignature(dispatchOrder, {
			...payload,
			user_code_updated: user?.username,
			user_name_updated: user?.username
		})
	}

	@Api({
		endpoint: 'update-container-condition/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok'
	})
	@AuthGuard()
	async updateContainerCondition(
		@User() user: Partial<UserEntity>,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateContainerConditionDTO)) payload: UpdateContainerConditionDTO
	) {
		return await this.deliveryService.updateContainerCondition(dispatchOrder, {
			...payload,
			user_name_updated: user.username,
			user_code_updated: user.username
		})
	}

	@Get('export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportPackingWeightReport(
		@Query(new ZodValidationPipe(filterQueryDTO)) filterQueryDTO: FilterQueryDTO,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.deliveryService.exportToExcel(factoryCode, filterQueryDTO)
		return reply.send(buffer)
	}
}
