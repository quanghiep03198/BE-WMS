import { StockedInHandler } from './stocked-in/stocked-in.handler'
import { UpdateStockInDateFailedEventHandler } from './update-stock-in-date-failed/update-stock-in-date-failed.handler'

export const InoutboundEventHandlers = [StockedInHandler, UpdateStockInDateFailedEventHandler]
