import { DeleteDefectiveGoodsHandler } from './delete-defective-goods/delete-defective-goods.handler'
import { StockInDefectiveGoodsHandler } from './stock-in/stock-in.handler'
import { StockOutDefectiveGoodsHandler } from './stock-out/stock-out.handler'
import { SyncDefectiveGoodsHandler } from './sync-defective-goods/sync-defective-goods.handler'
import { UpdateDefectiveGoodsHandler } from './update-defective-goods/update-defective-goods.handler'
import { UpsertDefectiveGoodsHandler } from './upsert-defective-goods/upsert-defective-goods.handler'

export const DefectiveGoodsCommandHandlers = [
	UpsertDefectiveGoodsHandler,
	UpdateDefectiveGoodsHandler,
	DeleteDefectiveGoodsHandler,
	SyncDefectiveGoodsHandler,
	StockInDefectiveGoodsHandler,
	StockOutDefectiveGoodsHandler
]
