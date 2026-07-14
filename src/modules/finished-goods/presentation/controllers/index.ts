import { MoExchangeController } from './mo-exchange.controller'
import { RFIDController } from './rfid.controller'
import { StockController } from './stock.controller'

export const FinishedGoodsControllers = [StockController, RFIDController, MoExchangeController]
