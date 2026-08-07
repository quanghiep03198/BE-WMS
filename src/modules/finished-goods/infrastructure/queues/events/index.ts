import { BulkWriteEpcsQueueEvents } from './bulk-write-epcs.events'
import { CommitExchangeMoQueueEvent } from './commit-exchange-mo.event'
import { CommitStockOutQueueEvent } from './commit-stock-out.event'
import { CommitStockVariationQueueEvent } from './commit-stock-variation.event'
import { CommitUpsertEpcsMatchQueueEvent } from './commit-upsert-epcs-match.event'

export const FinsishedGoodsQueueEvents = [
	BulkWriteEpcsQueueEvents,
	CommitExchangeMoQueueEvent,
	CommitStockVariationQueueEvent,
	CommitStockOutQueueEvent,
	CommitUpsertEpcsMatchQueueEvent
]
