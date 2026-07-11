import { ExchangeMoFailedHandler } from './exchange-mo-failed/exchange-mo-failed.handler'
import { ExchangeMoSuccessHandler } from './exchange-mo-success/exchange-mo-success.handler'
import { StockedInHandler } from './stocked-in/stocked-in.handler'
import { UpdateStockInTimestampFailedHandler } from './update-stock-in-timestamp-failed/update-stock-in-date-failed.handler'
import { UpdateStockInTimestampSuccessHandler } from './update-stock-in-timestamp-success/update-stock-in-timestamp-success.handler'

export const InoutboundEventHandlers = [
	StockedInHandler,
	UpdateStockInTimestampSuccessHandler,
	UpdateStockInTimestampFailedHandler,
	ExchangeMoSuccessHandler,
	ExchangeMoFailedHandler
]
