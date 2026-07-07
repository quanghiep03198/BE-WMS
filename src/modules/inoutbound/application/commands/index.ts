import { BulkWriteInventoryHandler } from './bulk-write-inventory/bulk-write-inventory.handler'
import { CreateEpcChangeStreamHandler } from './create-epc-change-stream/create-epc-change-stream.handler'
import { DeleteScanningEpcsHandler } from './delete-scanning-epcs/delete-scanning-epcs.handler'
import { DeleteScanningMoHandler } from './delete-scanning-mo/delete-scanning-mo.handler'
import { ExchangeMoRmHandler } from './exchange-mo/handlers/exchange-mo-rm.handler'
import { ExchangeMoWmHandler } from './exchange-mo/handlers/exchange-mo-wm.handler'
import { RollbackExchangeMoTransactionHandler } from './rollback-exchange-mo-tx/rollback-exchange-mo-tx.handler'
import { RollbackStockTransactionHandler } from './rollback-stock-tx/rollback-stock-tx.handler'
import { StockInHandler } from './stock-in/stock-in.handler'
import { SyncInventoryAuditHandler } from './sync-inventory-audit/sync-inventory-audit.handler'
import { UpdateStockInTimestampHandler } from './update-stock-in-timestamp/update-stock-in-timestamp.handler'
import { UpsertEpcInfoHandler } from './upsert-epc-info/upsert-epc-info.handler'

export const InoutboundCommandHandlers = [
	BulkWriteInventoryHandler,
	CreateEpcChangeStreamHandler,
	DeleteScanningEpcsHandler,
	DeleteScanningMoHandler,
	ExchangeMoWmHandler,
	ExchangeMoRmHandler,
	RollbackExchangeMoTransactionHandler,
	RollbackStockTransactionHandler,
	StockInHandler,
	SyncInventoryAuditHandler,
	UpdateStockInTimestampHandler,
	UpsertEpcInfoHandler
]
