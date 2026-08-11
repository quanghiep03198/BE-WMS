import { ExportMonthlyInventoryAuditHandler } from './export-monthly-inventory-audit/export-monthly-inventory-audit.handler'
import { GetMonthlyInventoryAuditHandler } from './get-monthly-inventory-audit/get-monthly-inventory-audit.handler'

export const InventoryAuditQueryHandlers = [GetMonthlyInventoryAuditHandler, ExportMonthlyInventoryAuditHandler]
