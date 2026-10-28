import { CreateDefectiveGoodsHandler } from './create-defective-goods/create-defective-goods.handler'
import { DeleteManyDefectiveGoodsHandler } from './delete-many/delete-many-defective-goods.handler'
import { DeleteOneDefectiveGoodsHandler } from './delete-one/delete-defective-goods.handler'
import { StockInDefectiveGoodsHandler } from './stock-in/stock-in.handler'
import { StockOutDefectiveGoodsHandler } from './stock-out/stock-out.handler'
import { SyncDefectiveGoodsHandler } from './sync-defective-goods/sync-defective-goods.handler'
import { UpdateDefectiveGoodsHandler } from './update-defective-goods/update-defective-goods.handler'

export const DefectiveGoodsCommandHandlers = [
	CreateDefectiveGoodsHandler,
	UpdateDefectiveGoodsHandler,
	DeleteOneDefectiveGoodsHandler,
	DeleteManyDefectiveGoodsHandler,
	SyncDefectiveGoodsHandler,
	StockInDefectiveGoodsHandler,
	StockOutDefectiveGoodsHandler
]
