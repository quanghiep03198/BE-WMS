import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsController } from './defective-goods.controller'
import { DefectiveGoodsService } from './defective-goods.service'
import { DefectiveGoodEntity } from './entities/defective-goods.entity'

@Module({
	imports: [TypeOrmModule.forFeature([DefectiveGoodEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [DefectiveGoodsController],
	providers: [DefectiveGoodsService]
})
export class DefectiveGoodsModule {}
