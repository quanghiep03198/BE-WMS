import { ExportMonthlyInventoryAuditHandler } from './export-monthly-inventory-audit/export-monthly-inventory-audit.handler'
import { GetMonthlyInventoryAuditHandler } from './get-monthly-inventory-audit/get-monthly-inventory-audit.handler'
import { GetProductionInventoryHandler } from './get-production-inventory/get-production-inventory.handler'

export const InventoryAuditQueryHandlers = [
	GetMonthlyInventoryAuditHandler,
	ExportMonthlyInventoryAuditHandler,
	GetProductionInventoryHandler
]
