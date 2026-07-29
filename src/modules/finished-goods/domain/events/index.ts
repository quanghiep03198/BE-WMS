import { CommitStockInFailureHandler } from './commit-stock-in-failure/commit-stock-in-failure.handler'
import { CommitStockOutFailureHandler } from './commit-stock-out-failure/commit-stock-out.handler'
import { CommitedStockInHandler } from './committed-stock-in/commited-stock-in.handler'
import { CommittedStockOutHandler } from './committed-stock-out/commited-stock-out.handler'
import { ExchangeMoFailedHandler } from './exchange-mo-failed/exchange-mo-failed.handler'
import { ExchangeMoSuccessHandler } from './exchange-mo-success/exchange-mo-success.handler'
import { StockedInHandler } from './stocked-in/stocked-in.handler'
import { StockedOutHandler } from './stocked-out/stocked-out.handler'
import { UpsertedEpcsMatchHandler } from './upserted-epcs-match/upserted-epcs-match.handler'

export const FinishedGoodsEventHandlers = [
	CommitStockInFailureHandler,
	CommitStockOutFailureHandler,
	CommitedStockInHandler,
	CommittedStockOutHandler,
	ExchangeMoFailedHandler,
	ExchangeMoSuccessHandler,
	StockedInHandler,
	StockedOutHandler,
	UpsertedEpcsMatchHandler
]
