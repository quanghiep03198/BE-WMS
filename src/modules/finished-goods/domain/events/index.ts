import { ExchangeMoSuccessHandler } from './exchange-mo-success/exchange-mo-success.handler'
import { StockedInHandler } from './stocked-in/stocked-in.handler'
import { StockedOutHandler } from './stocked-out/stocked-out.handler'
import { UpsertedEpcsMatchHandler } from './upserted-epcs-match/upserted-epcs-match.handler'

export const FinishedGoodsEventHandlers = [
	ExchangeMoSuccessHandler,
	StockedInHandler,
	StockedOutHandler,
	UpsertedEpcsMatchHandler
]
