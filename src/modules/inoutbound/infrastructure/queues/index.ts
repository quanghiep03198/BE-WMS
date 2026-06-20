import { RFIDImportDataConsumer } from './rfid-import-data.consumer'
import { RFIDInboundConsumer } from './rfid-inbound.consumer'
import { RFIDOutboundConsumer } from './rfid-outbound.consumer'

export const RFIDConsumers = [RFIDInboundConsumer, RFIDOutboundConsumer, RFIDImportDataConsumer]
