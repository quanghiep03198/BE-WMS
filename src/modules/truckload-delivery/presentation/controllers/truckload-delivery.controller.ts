import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, StrictRoles, TRequestUser } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { UserRole } from '@modules/user/domain/constants'
import {
	Body,
	Controller,
	DefaultValuePipe,
	ForbiddenException,
	Get,
	Headers,
	HttpStatus,
	Param,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FastifyReply } from 'fastify'
import { unflatten } from 'flat'
import { CreateDispatchOrderCommand } from '../../application/commands/create-dispatch-order/create-dispatch-order.command'
import { DeleteDispatchOrderCommand } from '../../application/commands/delete-dispatch-order/delete-dispatch-order.command'
import { RemovePurchaseOrderCommand } from '../../application/commands/remove-purchase-order/remove-purchase-order.command'
import { SignDispatchOrderCommand } from '../../application/commands/sign-dispatch-order/sign-dispatch-order.command'
import { UpdateContainerConditionCommand } from '../../application/commands/update-container-condition/update-container-condition.command'
import { UpdateDispatchOrderCommand } from '../../application/commands/update-dispatch-order/update-dispatch-order.command'
import { UpsertPurchaseOrdersCommand } from '../../application/commands/upsert-purchase-orders/upsert-purchase-orders.command'
import {
	createDeliveryDTO,
	CreateDeliveryDTO,
	filterQueryDTO,
	FilterQueryDTO,
	UnflatedFilterQueryDTO,
	updateContainerConditionDTO,
	UpdateContainerConditionDTO,
	updateDeliveryDTO,
	UpdateDeliveryDTO,
	updateSignatureDTO,
	UpdateSignatureDTO,
	upsertPurchaseOrdersDTO,
	UpsertPurchaseOrdersDTO
} from '../../application/dto/truckload-delivery.dto'
import { ExportDispatchOrdersQuery } from '../../application/queries/export-dispatch-orders/export-dispatch-orders.query'
import { GetDispatchOrderSignatureQuery } from '../../application/queries/get-dispatch-order-signature/get-dispatch-order-signature.query'
import { GetDispatchOrdersQuery } from '../../application/queries/get-dispatch-orders/get-dispatch-orders.query'
import { SearchDispatchPurchaseOrdersQuery } from '../../application/queries/search-dispatch-purchase-orders/search-dispatch-purchase-orders.query'
import { TruckloadDeliveryExceptionFilter } from '../filters/truckload-delivery-exception.filter'

@Controller('truckload-delivery')
export class TruckloadDeliveryController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@RouteHandler({
		method: HttpMethod.GET,
		message: 'common.ok',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.IE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.SECURITY_GUARD,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getDispatchOrders(
		@Query(new ZodValidationPipe(filterQueryDTO), new DefaultValuePipe({ page: 1, limit: 20 })) query: FilterQueryDTO
	) {
		return await this.queryBus.execute(
			new GetDispatchOrdersQuery(unflatten<FilterQueryDTO, UnflatedFilterQueryDTO>(query))
		)
	}

	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async create(
		@RequestUser() user: TRequestUser,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(createDeliveryDTO)) payload: CreateDeliveryDTO
	) {
		return await this.commandBus.execute(
			new CreateDispatchOrderCommand(
				factoryCode,
				payload.outbound_purchase_orders,
				payload.license_plate,
				payload.container_number,
				payload.seal_number,
				user
			)
		)
	}

	@RouteHandler({
		endpoint: 'search-dispatch-purchase-order',
		method: HttpMethod.GET,
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async search(@Query('search') search: string) {
		return await this.queryBus.execute(new SearchDispatchPurchaseOrdersQuery(search))
	}

	@RouteHandler({
		endpoint: 'bulk-update/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async update(
		@RequestUser() user: TRequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateDeliveryDTO)) payload: UpdateDeliveryDTO
	) {
		return await this.commandBus.execute(new UpdateDispatchOrderCommand(dispatchOrder, payload, user))
	}

	@RouteHandler({
		endpoint: 'upsert-purchase-orders/:dispatchOrder',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async upsert(
		@RequestUser() user: TRequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(upsertPurchaseOrdersDTO)) payload: UpsertPurchaseOrdersDTO
	) {
		return await this.commandBus.execute(new UpsertPurchaseOrdersCommand(dispatchOrder, payload, user))
	}

	@RouteHandler({
		endpoint: 'delete/:dispatchOrder/purchase-orders/:po',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async removePurchaseOrder(
		@RequestUser() user: TRequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Param('po') po: string
	) {
		return await this.commandBus.execute(new RemovePurchaseOrderCommand(dispatchOrder, po, user))
	}

	@RouteHandler({
		endpoint: 'bulk-delete/:dispatchOrder',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF)
	async delete(@Param('dispatchOrder') dispatchOrder: string) {
		return await this.commandBus.execute(new DeleteDispatchOrderCommand(dispatchOrder))
	}

	@RouteHandler({
		endpoint: 'update-signature/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.IE_STAFF, UserRole.FG_WAREHOUSE_STAFF, UserRole.SECURITY_GUARD)
	async sign(
		@RequestUser() user: TRequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateSignatureDTO)) payload: UpdateSignatureDTO
	) {
		const roleMap: Record<string, { role: UserRole; message: string }> = {
			ie_signature: { role: UserRole.IE_STAFF, message: 'Only IE Staff can update IE Signature' },
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
		const requirement = roleMap[payload.signature_type]
		if (requirement && !(user?.roles ?? []).includes(requirement.role))
			throw new ForbiddenException(requirement.message)
		return await this.commandBus.execute(
			new SignDispatchOrderCommand(
				dispatchOrder,
				payload.signature_type,
				payload.signature,
				payload.approval_status,
				user
			)
		)
	}

	@RouteHandler({
		endpoint: 'update-container-condition/:dispatchOrder',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.ok',
		exceptionFilter: TruckloadDeliveryExceptionFilter
	})
	@RequireAuthorized(UserRole.FG_WAREHOUSE_STAFF)
	async condition(
		@RequestUser() user: TRequestUser,
		@Param('dispatchOrder') dispatchOrder: string,
		@Body(new ZodValidationPipe(updateContainerConditionDTO)) payload: UpdateContainerConditionDTO
	) {
		return await this.commandBus.execute(new UpdateContainerConditionCommand(dispatchOrder, payload, user))
	}

	@Get('signatures/:signatureId')
	@UseFilters(TruckloadDeliveryExceptionFilter)
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.IE_STAFF,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.SECURITY_GUARD,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getSignature(
		@Param('signatureId') signatureId: string,
		@Headers('if-none-match') ifNoneMatch: string | undefined,
		@Res() reply: FastifyReply
	) {
		// * GridFS files are never modified (a new signature gets a new id), so the id is a perfect strong ETag
		const etag = `"${signatureId}"`
		const cacheHeaders = { 'Cache-Control': 'private, max-age=31536000, immutable', ETag: etag }
		if (ifNoneMatch === etag) return reply.status(HttpStatus.NOT_MODIFIED).headers(cacheHeaders).send()

		const { buffer, contentType } = await this.queryBus.execute(new GetDispatchOrderSignatureQuery(signatureId))
		return reply
			.headers({
				...cacheHeaders,
				'Content-Type': contentType,
				'Content-Length': buffer.length,
				'Cross-Origin-Resource-Policy': 'cross-origin'
			})
			.send(buffer)
	}

	@Get('export')
	@UseFilters(TruckloadDeliveryExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.IE_STAFF, UserRole.SECURITY_GUARD)
	async export(
		@Query(new ZodValidationPipe(filterQueryDTO)) query: FilterQueryDTO,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.queryBus.execute(
			new ExportDispatchOrdersQuery(factoryCode, unflatten<FilterQueryDTO, UnflatedFilterQueryDTO>(query))
		)
		return reply.send(buffer)
	}
}
