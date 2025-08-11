import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsService } from './defective-goods.service'
import { DefectiveGoodsController } from './defective-product.controller'

@Module({
	imports: [TypeOrmModule],
	controllers: [DefectiveGoodsController],
	providers: [DefectiveGoodsService]
})
export class DefectiveGoodsModule {}
