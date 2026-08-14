import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthorized, ResponseMessage, RouteHandler } from '@common/decorators'
import { HttpExceptionFilter } from '@common/filters'
import { ZodValidationPipe } from '@common/pipes'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	ParseArrayPipe,
	Patch,
	Put,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { UserRole } from '../../../user/constants'
// import { SYNC_INVENTORY_AUDIT_QUEUE } from '../../domain/constants'
import { CheckoutInventoryAuditCommand } from '@modules/inventory/application/commands/checkout-inventory-audit/checkout-inventory-audit.command'
import { UpdateInventorySupplementalQtyCommand } from '@modules/inventory/application/commands/update-inventory-supplemental-qty/update-inventory-supplemental-qty.command'
import { ExportMonthlyInventoryAuditQuery } from '@modules/inventory/application/queries/export-monthly-inventory-audit/export-monthly-inventory-audit.query'
import { GetMonthlyInventoryAuditQuery } from '@modules/inventory/application/queries/get-monthly-inventory-audit/get-monthly-inventory-audit.query'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ProductionInventoryService } from '../../infrastructure/persistence/mssql/services/product-inventory.service'
import {
	bulkUpdateInventoryAuditPayload,
	BulkUpdateInventoryReportDTO,
	productInventoryReportQuery,
	ProductInventoryReportQueryDTO,
	updateInventoryReportQuery,
	UpdateInventoryReportQueryDTO
} from '../dto/inventory-report.dto'
import { InventoryAuditExceptionFilter } from '../filters/inventory-audit.filter'

@Controller('inventory')
export class InventoryController {
	constructor(
		@InjectPinoLogger(InventoryController.name) private readonly logger: PinoLogger,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly productionInventoryService: ProductionInventoryService
	) {}

	// #region Inventory Audit

	@RouteHandler({ endpoint: 'audit', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getMonthlyInventoryReport(
		@Query('month:eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.queryBus.execute(new GetMonthlyInventoryAuditQuery(month))
	}

	@Get('audit/export')
	@UseFilters(HttpExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportMonthlyInventoryReport(
		@Query('month:eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string,
		@Query('mo_no:in', new DefaultValuePipe([]), new ParseArrayPipe({ items: String, separator: ',' }))
		manufacturingOrders: string[],
		@Query() query: Record<string, any>,
		@Headers(CommonRequestHeader.FACTORY_CODE) factory: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.queryBus.execute(
			new ExportMonthlyInventoryAuditQuery(month, factory, manufacturingOrders)
		)
		return reply.send(buffer)
	}

	@Patch('audit/update')
	@HttpCode(HttpStatus.CREATED)
	@ResponseMessage('common.created')
	@UseFilters(InventoryAuditExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async updateInventoryReport(
		@Query(new ZodValidationPipe(updateInventoryReportQuery)) filterQuery: UpdateInventoryReportQueryDTO,
		@Body(new ZodValidationPipe(bulkUpdateInventoryAuditPayload)) update: BulkUpdateInventoryReportDTO
	) {
		await this.commandBus.execute(new UpdateInventorySupplementalQtyCommand(filterQuery, update))
		return filterQuery
	}

	@Put('audit/checkout/:month')
	@HttpCode(HttpStatus.CREATED)
	@ResponseMessage('common.created')
	@UseFilters(InventoryAuditExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async processInventoryAuditCheckout(
		@Param('month', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		await this.commandBus.execute(new CheckoutInventoryAuditCommand(month))
	}

	// #endregion

	// #region Inventory Summary
	@RouteHandler({ endpoint: 'summary', method: HttpMethod.GET, statusCode: HttpStatus.OK })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getProductInventory(
		@Query(new ZodValidationPipe(productInventoryReportQuery)) filterQueries: ProductInventoryReportQueryDTO
	) {
		return await this.productionInventoryService.getProductInventory(filterQueries)
	}

	@Get('summary/export')
	@UseFilters(HttpExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportInventorySummary(
		@Headers(CommonRequestHeader.FACTORY_CODE) factory: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.productionInventoryService.exportProductionInventorySummary(factory)
		return reply.send(buffer)
	}

	@RouteHandler({ endpoint: 'production-features', method: HttpMethod.GET, statusCode: HttpStatus.OK })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getProductInventoryFeatures() {
		return await this.productionInventoryService.getProductionInventoryFeatures()
	}
	// #endregion
}
