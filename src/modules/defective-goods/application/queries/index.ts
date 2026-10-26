import { CheckActiveEpcsHandler } from './check-active-epcs/check-active-epcs.handler'
import { GetDefectiveGoodsHandler } from './get-defective-goods/get-defective-goods.handler'
import { GetDailyInboundReportHandler } from './get-daily-inbound-report/get-daily-inbound-report.handler'
import { ExportDailyInboundReportHandler } from './export-daily-inbound-report/export-daily-inbound-report.handler'
import { GetDailyOutboundReportHandler } from './get-daily-outbound-report/get-daily-outbound-report.handler'
import { ExportDailyOutboundReportHandler } from './export-daily-outbound-report/export-daily-outbound-report.handler'
import { GetDefectiveGoodsInventoryHandler } from './get-defective-goods-inventory/get-defective-goods-inventory.handler'
import { ExportDefectiveGoodsInventoryHandler } from './export-defective-goods-inventory/export-defective-goods-inventory.handler'

export const DefectiveGoodsQueryHandlers = [
	GetDefectiveGoodsHandler,
	CheckActiveEpcsHandler,
	GetDailyInboundReportHandler,
	ExportDailyInboundReportHandler,
	GetDailyOutboundReportHandler,
	ExportDailyOutboundReportHandler,
	GetDefectiveGoodsInventoryHandler,
	ExportDefectiveGoodsInventoryHandler
]
