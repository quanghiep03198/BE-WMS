import { BulkWriteInventoryHandler } from './bulk-write-inventory/bulk-write-inventory.handler'
import { CommitStockOutHandler } from './commit-stock-out/commit-stock-out.handler'
import { CommitStockVariationHandler } from './commit-stock-variation/commit-stock-variation.handler'
import { CommitUpsertEpcsMatchHandler } from './commit-upsert-epcs-match/commit-upsert-epcs-match.handler'
import { CreateEpcChangeStreamHandler } from './create-epc-change-stream/create-epc-change-stream.handler'
import { DeleteScanningEpcsHandler } from './delete-scanning-epcs/delete-scanning-epcs.handler'
import { DeleteScanningMoHandler } from './delete-scanning-mo/delete-scanning-mo.handler'
import { ExchangeMoRmHandler } from './exchange-mo/handlers/exchange-mo-rm.handler'
import { ExchangeMoWmHandler } from './exchange-mo/handlers/exchange-mo-wm.handler'
import { RecallFromStockHandler } from './recall-from-stock/recall-from-stock.handler'
import { RestoreDeletedEpcsHandler } from './restore-deleted-epcs/restore-deleted-epcs.handler'
import { StockInHandler } from './stock-in/stock-in.handler'
import { StockOutHandler } from './stock-out/stock-out.handler'

import { UpsertEpcsMatchHandler } from './upsert-epcs-match/upsert-epcs-match.handler'

export const FinishedGoodsCommandHandlers = [
	BulkWriteInventoryHandler,
	CommitStockVariationHandler,
	CommitStockOutHandler,
	CreateEpcChangeStreamHandler,
	CommitUpsertEpcsMatchHandler,
	DeleteScanningEpcsHandler,
	DeleteScanningMoHandler,
	ExchangeMoWmHandler,
	ExchangeMoRmHandler,
	// UpsertEpcsMatchHandler,
	RecallFromStockHandler,
	RestoreDeletedEpcsHandler,
	// RollbackExchangeMoTransactionHandler,
	// RollbackStockTransactionHandler,
	StockInHandler,
	StockOutHandler,
	UpsertEpcsMatchHandler
]
