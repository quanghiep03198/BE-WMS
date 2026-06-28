import { BulkWriteInventoryCommandHandler } from './bulk-write-inventory/bulk-write-inventory.handler'
import { CreateEpcChangeStreamHandler } from './create-epc-change-stream/create-epc-change-stream.handler'
import { RollbackStockTransactionHandler } from './rollback-stock-transaction/rollback-stock-transaction.handler'
import { StockInHandler } from './stock-in/stock-in.handler'
import { UpdateStockInDateHandler } from './update-stock-in-date/update-stock-in-date.handler'

export const InoutboundCommandHandlers = [
	BulkWriteInventoryCommandHandler,
	UpdateStockInDateHandler,
	StockInHandler,
	RollbackStockTransactionHandler,
	CreateEpcChangeStreamHandler
]
