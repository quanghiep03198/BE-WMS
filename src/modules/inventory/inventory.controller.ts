import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
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
import { format } from 'date-fns'
import { type Response } from 'express'
import {
	productInventoryReportQuery,
	ProductInventoryReportQueryDTO,
	UpdateInventoryReportDTO,
	updateInventoryReportPayload,
	updateInventoryReportQuery,
	UpdateInventoryReportQueryDTO
} from './dto/inventory-report.dto'
import { InventoryAuditService } from './services/inventory-report.service'
import { ProductionInventoryService } from './services/product-inventory.service'

@Controller('inventory')
export class InventoryController {
	constructor(
		private readonly inventoryReportService: InventoryAuditService,
		private readonly productionInventoryService: ProductionInventoryService
	) {}

	// #region Inventory Audit

	@Api({ endpoint: 'audit', method: HttpMethod.GET })
	@AuthGuard()
	async getMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.inventoryReportService.getMonthlyInventoryReport(format(new Date(month), 'yyyyMM'))
	}

	@Get('audit/export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string,
		@Query('mo_no.in', new DefaultValuePipe([]), ParseArrayPipe) commandNumbers: string[],
		@Res() res: Response
	) {
		const buffer = await this.inventoryReportService.exportMonthlyInventoryToExcel(month, commandNumbers)
		return res.send(buffer)
	}

	@Api({ endpoint: 'audit/update', method: HttpMethod.PATCH, statusCode: HttpStatus.CREATED })
	@AuthGuard()
	async updateInventoryReport(
		@Query(new ZodValidationPipe(updateInventoryReportQuery)) queries: UpdateInventoryReportQueryDTO,
		@Body(new ZodValidationPipe(updateInventoryReportPayload)) payload: UpdateInventoryReportDTO,
		@User('username') username: string
	) {
		return await this.inventoryReportService.bulkUpdateInventoryReport(
			queries,
			payload.map((item) => ({ ...item, user_code_updated: username, user_name_updated: username }))
		)
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
