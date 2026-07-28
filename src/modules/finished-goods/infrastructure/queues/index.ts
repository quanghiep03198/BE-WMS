import { BulkWriteInboundEpcsConsumer } from './consumers/bulk-write-inbound-epcs.consumer'
import { BulkWriteOutboundEpcsConsumer } from './consumers/bulk-write-outbound-epcs.consumer'
import { ImportInoutboundEpcsConsumer } from './consumers/import-inoutbound-epcs.consumer'
import { RollbackExchangeMoTransactionConsumer } from './consumers/rollback-exchange-mo-tx.consumer'
import { RollbackStockInTransactionConsumer } from './consumers/rollback-stock-tx.consumer'

export const FinishedGoodsConsumers = [
	BulkWriteInboundEpcsConsumer,
	BulkWriteOutboundEpcsConsumer,
	ImportInoutboundEpcsConsumer,
	RollbackStockInTransactionConsumer,
	RollbackExchangeMoTransactionConsumer
]
