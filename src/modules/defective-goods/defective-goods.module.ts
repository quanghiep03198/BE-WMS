import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsController } from './defective-goods.controller'
import { DefectiveGoodsEntity } from './entities/defective-goods.entity'
import { DefectiveGoodsService } from './services/defective-goods.service'
import { DefectiveGoodsInboundService } from './services/defective-inbound.service'
import { DefectiveGoodsInventoryService } from './services/defective-inventory.service'
import { DefectiveGoodsOutboundService } from './services/defective-outbound.service'

@Module({
	imports: [TypeOrmModule.forFeature([DefectiveGoodsEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [DefectiveGoodsController],
	providers: [
		DefectiveGoodsService,
		DefectiveGoodsInboundService,
		DefectiveGoodsOutboundService,
		DefectiveGoodsInventoryService
	]
})
export class DefectiveGoodsModule {}
