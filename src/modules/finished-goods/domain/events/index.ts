import { ExchangedManufacturingOrderHandler } from './exchanged-manufacturing-order/exchanged-manufacturing-order.handler'
import { RolledBackInboundTxHandler } from './rolledback-inbound-tx/rolledback-inbound-tx.handler'
import { StockedInHandler } from './stocked-in/stocked-in.handler'
import { StockedOutHandler } from './stocked-out/stocked-out.handler'
import { UpsertedEpcsMatchHandler } from './upserted-epcs-match/upserted-epcs-match.handler'

export const FinishedGoodsEventHandlers = [
	ExchangedManufacturingOrderHandler,
	StockedInHandler,
	StockedOutHandler,
	UpsertedEpcsMatchHandler,
	RolledBackInboundTxHandler
]
