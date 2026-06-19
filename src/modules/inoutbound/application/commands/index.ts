import { BulkWriteInventoryCommandHandler } from './bulk-write-inventory/bulk-write-inventory.handler'
import { RollbackStoredEpcsHandler } from './rollback-stored-epcs/rollback-stored-epcs.handler'
import { StockInHandler } from './stock-in/stock-in.handler'
import { UpdateStockInDateHandler } from './update-stock-in-date/update-stock-in-date.handler'

export const InoutboundCommandHandlers = [
	BulkWriteInventoryCommandHandler,
	UpdateStockInDateHandler,
	StockInHandler,
	RollbackStoredEpcsHandler
]
