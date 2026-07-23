import { BulkWriteInboundEpcsConsumer } from './bulk-write-inbound-epcs.consumer'
import { BulkWriteOutboundEpcsConsumer } from './bulk-write-outbound-epcs.consumer'
import { ImportInoutboundEpcsConsumer } from './import-inoutbound-epcs.consumer'
import { RollbackExchangeMoTransactionConsumer } from './rollback-exchange-mo-tx.consumer'
import { RollbackStockInTransactionConsumer } from './rollback-stock-tx.consumer'

export const FinishedGoodsConsumers = [
	BulkWriteInboundEpcsConsumer,
	BulkWriteOutboundEpcsConsumer,
	ImportInoutboundEpcsConsumer,
	RollbackStockInTransactionConsumer,
	RollbackExchangeMoTransactionConsumer
]
