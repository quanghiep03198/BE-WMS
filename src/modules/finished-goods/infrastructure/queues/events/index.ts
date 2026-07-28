import { BulkWriteEpcsQueueEvents } from './bulk-write-epcs.events'
import { StockInQueueEvent } from './stock-in.event'

export const FinsishedGoodsQueueEvents = [BulkWriteEpcsQueueEvents, StockInQueueEvent]
