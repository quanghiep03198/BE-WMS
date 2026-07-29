import { BulkWriteInventoryHandler } from './bulk-write-inventory/bulk-write-inventory.handler'
import { CommitStockOutHandler } from './commit-stock-out/commit-stock-out.handler'
import { CommitStockVariationHandler } from './commit-stock-variation/commit-stock-variation.handler'
import { CreateEpcChangeStreamHandler } from './create-epc-change-stream/create-epc-change-stream.handler'
import { DeleteScanningEpcsHandler } from './delete-scanning-epcs/delete-scanning-epcs.handler'
import { DeleteScanningMoHandler } from './delete-scanning-mo/delete-scanning-mo.handler'
import { ExchangeMoRmHandler } from './exchange-mo/handlers/exchange-mo-rm.handler'
import { ExchangeMoWmHandler } from './exchange-mo/handlers/exchange-mo-wm.handler'
import { RecallFromStockHandler } from './recall-from-stock/recall-from-stock.handler'
import { RestoreDeletedEpcsHandler } from './restore-deleted-epcs/restore-deleted-epcs.handler'
import { RollbackExchangeMoTransactionHandler } from './rollback-exchange-mo-tx/rollback-exchange-mo-tx.handler'
import { RollbackStockTransactionHandler } from './rollback-stock-tx/rollback-stock-tx.handler'
import { StockInHandler } from './stock-in/stock-in.handler'
import { StockOutHandler } from './stock-out/stock-out.handler'
import { SyncInventoryAuditHandler } from './sync-inventory-audit/sync-inventory-audit.handler'
import { UpdateScanningEpcsMatchHandler } from './update-scanning-epcs-match/update-scanning-epcs-match.handler'
import { UpsertEpcsMatchHandler } from './upsert-epcs-match/upsert-epcs-match.handler'

export const FinishedGoodsCommandHandlers = [
	BulkWriteInventoryHandler,
	CommitStockVariationHandler,
	CommitStockOutHandler,
	CreateEpcChangeStreamHandler,
	DeleteScanningEpcsHandler,
	DeleteScanningMoHandler,
	ExchangeMoWmHandler,
	ExchangeMoRmHandler,
	// UpsertEpcsMatchHandler,
	RecallFromStockHandler,
	RestoreDeletedEpcsHandler,
	RollbackExchangeMoTransactionHandler,
	RollbackStockTransactionHandler,
	StockInHandler,
	StockOutHandler,
	SyncInventoryAuditHandler,
	UpsertEpcsMatchHandler,
	UpdateScanningEpcsMatchHandler
]
