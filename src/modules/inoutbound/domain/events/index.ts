import { ExchangeMoFailedEventHandler } from './exchange-mo-failed/exchange-mo-failed.handler'
import { ExchangeMoSuccessEventHandler } from './exchange-mo-success/exchange-mo-success.handler'
import { StockedInEventHandler } from './stocked-in/stocked-in.handler'
import { UpdateStockInTimestampFailedEventHandler } from './update-stock-in-timestamp-failed/update-stock-in-date-failed.handler'
import { UpdateStockInTimestampSuccessEventHandler } from './update-stock-in-timestamp-success/update-stock-in-timestamp-success.handler'

export const InoutboundEventHandlers = [
	StockedInEventHandler,
	UpdateStockInTimestampSuccessEventHandler,
	UpdateStockInTimestampFailedEventHandler,
	ExchangeMoSuccessEventHandler,
	ExchangeMoFailedEventHandler
]
