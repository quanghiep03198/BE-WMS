import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { HttpExceptionFilter } from '@common/filters'
import { ZodValidationPipe } from '@common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	Param,
	ParseArrayPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { UserRole } from '../user/constants'
import { SYNC_INVENTORY_AUDIT_QUEUE } from './constants'
import {
	productInventoryReportQuery,
	ProductInventoryReportQueryDTO,
	UpdateInventoryReportDTO,
	updateInventoryReportPayload,
	updateInventoryReportQuery,
	UpdateInventoryReportQueryDTO
} from './dto/inventory-report.dto'
import { InventoryAuditService } from './services/inventory-audit.service'
import { ProductionInventoryService } from './services/product-inventory.service'

@Controller('inventory')
export class InventoryController {
	constructor(
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE)
		private readonly syncInventoryAuditDataQueue: Queue<object>,
		private readonly inventoryReportService: InventoryAuditService,
		private readonly productionInventoryService: ProductionInventoryService
	) {}

	// #region Inventory Audit

	@RouteHandler({ endpoint: 'audit', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getMonthlyInventoryReport(
		@Query('month:eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.inventoryReportService.getMonthlyInventoryAudit(month)
	}

	@Get('audit/export')
	@UseFilters(HttpExceptionFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportMonthlyInventoryReport(
		@Query('month:eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string,
		@Query('mo_no.in', new DefaultValuePipe([]), ParseArrayPipe) commandNumbers: string[],
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.inventoryReportService.exportExcelInventoryAudit(month, factoryCode, commandNumbers)
		return reply.send(buffer)
	}

	@RouteHandler({ endpoint: 'audit/update', method: HttpMethod.PATCH, statusCode: HttpStatus.CREATED })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async updateInventoryReport(
		@Query(new ZodValidationPipe(updateInventoryReportQuery)) filterQuery: UpdateInventoryReportQueryDTO,
		@Body(new ZodValidationPipe(updateInventoryReportPayload)) update: UpdateInventoryReportDTO
	) {
		return await this.inventoryReportService.updateInventoryAudit(filterQuery, update)
	}

	@RouteHandler({ endpoint: 'audit/checkout/:month', method: HttpMethod.PUT, statusCode: HttpStatus.CREATED })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async processInventoryAuditCheckout(
		@Param('month', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.inventoryReportService.processInventoryAuditCheckout(month)
	}

	@RouteHandler({ endpoint: 'audit/sync', method: HttpMethod.POST, statusCode: HttpStatus.CREATED })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async syncInventoryAuditData(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Headers(CommonRequestHeader.USER_REQUEST) user: string
	) {
		return await this.syncInventoryAuditDataQueue.add(factoryCode, {}, { jobId: user })
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
