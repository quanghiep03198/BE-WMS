import { BulkWriteInboundEpcsQueueEvents } from './bulk-write-inbound-epcs.events'
import { BulkWriteOutboundEpcsQueueEvents } from './bulk-write-outbound-epcs.events'
import { CommitExchangeMoQueueEvent } from './commit-exchange-mo.event'
import { CommitStockBalancesQueueEvent } from './commit-stock-balances.event'
import { CommitStockOutQueueEvent } from './commit-stock-out.event'
import { CommitUpsertEpcsMatchQueueEvent } from './commit-upsert-epcs-match.event'

export const FinsishedGoodsQueueEvents = [
	BulkWriteInboundEpcsQueueEvents,
	BulkWriteOutboundEpcsQueueEvents,
	CommitExchangeMoQueueEvent,
	CommitStockBalancesQueueEvent,
	CommitStockOutQueueEvent,
	CommitUpsertEpcsMatchQueueEvent
]
