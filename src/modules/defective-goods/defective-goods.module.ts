import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsController } from './defective-goods.controller'
import { DefectiveGoodsService } from './defective-goods.service'

@Module({
	imports: [TypeOrmModule],
	controllers: [DefectiveGoodsController],
	providers: [DefectiveGoodsService]
})
export class DefectiveGoodsModule {}
