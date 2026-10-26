import { DeleteDefectiveGoodsHandler } from './delete-defective-goods/delete-defective-goods.handler'
import { UpdateDefectiveGoodsHandler } from './update-defective-goods/update-defective-goods.handler'
import { UpsertDefectiveGoodsHandler } from './upsert-defective-goods/upsert-defective-goods.handler'
import { SyncDefectiveGoodsHandler } from './sync-defective-goods/sync-defective-goods.handler'
import { UpdateInboundHandler } from './update-inbound/update-inbound.handler'
import { UpdateOutboundHandler } from './update-outbound/update-outbound.handler'

export const DefectiveGoodsCommandHandlers = [UpsertDefectiveGoodsHandler, UpdateDefectiveGoodsHandler, DeleteDefectiveGoodsHandler, SyncDefectiveGoodsHandler, UpdateInboundHandler, UpdateOutboundHandler]
