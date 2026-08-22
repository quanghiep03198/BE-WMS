import { BulkWriteInboundEpcsConsumer } from './bulk-write-inbound-epcs.consumer'
import { BulkWriteOutboundEpcsConsumer } from './bulk-write-outbound-epcs.consumer'
import { CommitExchangeMoConsumer } from './commit-exchange-mo.consumer'
import { RollbackInboundTxConsumer } from './commit-rollback-inbound-tx.consumer'
import { CommitStockBalancesConsumer } from './commit-stock-balances.consumer'
import { CommitStockOutConsumer } from './commit-stock-out.consumer'
import { CommitUpsertEpcsMatchConsumer } from './commit-upsert-epcs-match.consumer'
import { ImportInoutboundEpcsConsumer } from './import-inoutbound-epcs.consumer'

export const FinishedGoodsConsumers = [
	BulkWriteInboundEpcsConsumer,
	BulkWriteOutboundEpcsConsumer,
	ImportInoutboundEpcsConsumer,
	CommitUpsertEpcsMatchConsumer,
	CommitExchangeMoConsumer,
	CommitStockBalancesConsumer,
	CommitStockOutConsumer,
	RollbackInboundTxConsumer
]
