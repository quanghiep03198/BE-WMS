import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	ParseArrayPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { type Response } from 'express'
import { uniqueId } from 'lodash'
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

	@Api({ endpoint: 'audit', method: HttpMethod.GET })
	@AuthGuard()
	async getMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.inventoryReportService.getMonthlyInventoryAudit(format(new Date(month), 'yyyyMM'))
	}

	@Get('audit/export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string,
		@Query('mo_no.in', new DefaultValuePipe([]), ParseArrayPipe) commandNumbers: string[],
		@Res() res: Response
	) {
		const buffer = await this.inventoryReportService.exportExcelInventoryAudit(month, commandNumbers)
		return res.send(buffer)
	}

	@Api({ endpoint: 'audit/update', method: HttpMethod.PATCH, statusCode: HttpStatus.CREATED })
	@AuthGuard()
	async updateInventoryReport(
		@Query(new ZodValidationPipe(updateInventoryReportQuery)) queries: UpdateInventoryReportQueryDTO,
		@Body(new ZodValidationPipe(updateInventoryReportPayload)) payload: UpdateInventoryReportDTO,
		@User('username') username: string
	) {
		return await this.inventoryReportService.bulkUpdateInventoryAudit(
			queries,
			payload.map((item) => ({ ...item, user_code_updated: username, user_name_updated: username }))
		)
	}

	@Api({ endpoint: 'audit/sync', method: HttpMethod.POST, statusCode: HttpStatus.CREATED })
	@AuthGuard()
	async syncInventoryAuditData(@Headers(CommonRequestHeader.TENANT_ID) tenantId: string) {
		return await this.syncInventoryAuditDataQueue.add(uniqueId(), {}, { jobId: tenantId })
	}
	// #endregion

	// #region Inventory Summary
	@Api({ endpoint: 'summary', method: HttpMethod.GET, statusCode: HttpStatus.OK })
	@AuthGuard()
	async getProductInventory(
		@Query(new ZodValidationPipe(productInventoryReportQuery)) filterQueries: ProductInventoryReportQueryDTO
	) {
		return await this.productionInventoryService.getProductInventory(filterQueries)
	}

	@Get('summary/export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportInventorySummary(@Headers(CommonRequestHeader.FACTORY_CODE) factory: string, @Res() res: Response) {
		const buffer = await this.productionInventoryService.exportProductionInventorySummary(factory)
		return res.send(buffer)
	}

	@Api({ endpoint: 'production-features', method: HttpMethod.GET, statusCode: HttpStatus.OK })
	@AuthGuard()
	async getProductInventoryFeatures() {
		return await this.productionInventoryService.getProductionInventoryFeatures()
	}
	// #endregion
}
