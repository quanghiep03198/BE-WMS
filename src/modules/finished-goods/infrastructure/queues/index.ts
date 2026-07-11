import { RFIDImportDataConsumer } from './rfid-import-data.consumer'
import { RFIDInboundConsumer } from './rfid-inbound.consumer'
import { RFIDOutboundConsumer } from './rfid-outbound.consumer'
import { RollbackExchangeMoTransactionConsumer } from './rollback-exchange-mo-tx.consumer'
import { RollbackStockInTransactionConsumer } from './rollback-stock-tx.consumer'

export const RFIDConsumers = [
	RFIDInboundConsumer,
	RFIDOutboundConsumer,
	RFIDImportDataConsumer,
	RollbackStockInTransactionConsumer,
	RollbackExchangeMoTransactionConsumer
]
