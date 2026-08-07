import { BulkWriteInboundEpcsConsumer } from './bulk-write-inbound-epcs.consumer'
import { BulkWriteOutboundEpcsConsumer } from './bulk-write-outbound-epcs.consumer'
import { CommitExchangeMoConsumer } from './commit-exchange-mo.consumer'
import { CommitStockOutConsumer } from './commit-stock-out.consumer'
import { CommitStockVariationConsumer } from './commit-stock-variation.consumer'
import { CommitUpsertEpcsMatchConsumer } from './commit-upsert-epcs-match.consumer'
import { ImportInoutboundEpcsConsumer } from './import-inoutbound-epcs.consumer'

export const FinishedGoodsConsumers = [
	BulkWriteInboundEpcsConsumer,
	BulkWriteOutboundEpcsConsumer,
	ImportInoutboundEpcsConsumer,
	CommitUpsertEpcsMatchConsumer,
	CommitExchangeMoConsumer,
	CommitStockVariationConsumer,
	CommitStockOutConsumer
]
