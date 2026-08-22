import { BulkWriteEpcsQueueEvents } from './bulk-write-epcs.events'
import { CommitExchangeMoQueueEvent } from './commit-exchange-mo.event'
import { CommitStockBalancesQueueEvent } from './commit-stock-balances.event'
import { CommitStockOutQueueEvent } from './commit-stock-out.event'
import { CommitUpsertEpcsMatchQueueEvent } from './commit-upsert-epcs-match.event'

export const FinsishedGoodsQueueEvents = [
	BulkWriteEpcsQueueEvents,
	CommitExchangeMoQueueEvent,
	CommitStockBalancesQueueEvent,
	CommitStockOutQueueEvent,
	CommitUpsertEpcsMatchQueueEvent
]
