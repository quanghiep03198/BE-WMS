import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, StrictRoles, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import {
	Body,
	Controller,
	DefaultValuePipe,
	ForbiddenException,
	Get,
	Headers,
	HttpStatus,
	Param,
	ParseIntPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { unflatten } from 'flat'
import { pick } from 'lodash'
import z from 'zod'
import { FactoryAgencyCode } from '../department/constants'
import { UserRole } from '../user/constants'
import {
	CreateDeliveryDTO,
	createDeliveryDTO,
	filterQueryDTO,
	FilterQueryDTO,
	UnflatedFilterQueryDTO,
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

	@RouteHandler({
		method: HttpMethod.GET,
		message: 'common.ok'
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.IE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.SECURITY_GUARD,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getDispatchOrders(
		@Query(new ZodValidationPipe(filterQueryDTO), new DefaultValuePipe({ page: 1, limit: 20 }))
		filterQueryDTO: FilterQueryDTO
	) {
		const unflatedFilterQuery = unflatten<FilterQueryDTO, UnflatedFilterQueryDTO>(filterQueryDTO)
		return await this.deliveryService.getDispatchOrders(unflatedFilterQuery)
	}

	@RouteHandler({
		endpoint: ':dispatchOrder',
		method: HttpMethod.GET,
		message: 'common.ok'
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.IE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.SECURITY_GUARD,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getDispatchOrderDetail(@Param('dispatchOrder') dispatchOrder: string) {
		return await this.deliveryService.getDispatchOrderDetail(dispatchOrder)
	}

	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async insertMany(
		@User() user: RequestUser,
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

	@RouteHandler({
		endpoint: 'search-dispatch-purchase-order',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async searchDispatchOutboundPurchaseOrder(@Query('search', new ZodValidationPipe(z.string())) searchTerm: string) {
		return await this.deliveryService.searchDispatchOutboundPurchaseOrder(searchTerm)
	}

	@RouteHandler({
		endpoint: 'bulk-update/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async bulkUpdateByDispatchOrder(
		@User() user: RequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateDeliveryDTO)) payload: UpdateDeliveryDTO
	) {
		return await this.deliveryService.bulkUpdateByDispatchOrder(dispatchOrder, {
			...payload,
			user_code_updated: user?.username,
			user_name_updated: user?.username
		})
	}

	@RouteHandler({
		endpoint: 'upsert-purchase-orders/:dispatchOrder',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async upsertPurchaseOrders(
		@User() user: RequestUser,
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

	@RouteHandler({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async deleteOne(@Param('id', ParseIntPipe) id: number) {
		return await this.deliveryService.deleteOneById(id)
	}

	@RouteHandler({
		endpoint: 'bulk-delete/:dispatchOrder',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async bulkDelete(@Param('dispatchOrder') dispatchOrder: string) {
		return await this.deliveryService.bulkDeleteByDispatchOrder(dispatchOrder)
	}

	@RouteHandler({
		endpoint: 'update-signature/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok'
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF, UserRole.SECURITY_GUARD)
	async updateDispatchOrderStatus(
		@User() user: RequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateSignatureDTO)) payload: UpdateSignatureDTO
	) {
		const ROLE_MAP: Record<string, { role: UserRole; message: string }> = {
			ie_signature: {
				role: UserRole.IE_STAFF,
				message: 'Only IE Staff can update IE Signature'
			},
			warehouse_officer_signature: {
				role: UserRole.FG_WAREHOUSE_STAFF,
				message: 'Only FG Warehouse Staff can update FG Warehouse Signature'
			},
			security_1_signature: {
				role: UserRole.SECURITY_GUARD,
				message: 'Only Security Guard can update Security Guard Signature'
			},
			security_2_signature: {
				role: UserRole.SECURITY_GUARD,
				message: 'Only Security Guard can update Security Guard Signature'
			}
		}

		const requirement = ROLE_MAP[payload.signature_type]
		if (requirement) {
			const roles = user?.roles ?? []
			if (!roles.includes(requirement.role)) {
				throw new ForbiddenException(requirement.message)
			}
		}

		return await this.deliveryService.updateDispatchOrderSignature(dispatchOrder, {
			...payload,
			user_code_updated: user?.username,
			user_name_updated: user?.username
		})
	}

	@RouteHandler({
		endpoint: 'update-container-condition/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok'
	})
	@RequireAuthorized(UserRole.FG_WAREHOUSE_STAFF)
	async updateContainerCondition(
		@User() user: RequestUser,
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
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.IE_STAFF, UserRole.SECURITY_GUARD)
	async exportPackingWeightReport(
		@Query(new ZodValidationPipe(filterQueryDTO)) filterQueryDTO: FilterQueryDTO,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const unflattenedFilterQuery = unflatten<FilterQueryDTO, UnflatedFilterQueryDTO>(filterQueryDTO)
		const buffer = await this.deliveryService.exportToExcel(factoryCode, unflattenedFilterQuery)
		return reply.send(buffer)
	}
}
