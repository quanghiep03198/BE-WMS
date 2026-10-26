import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DepartmentModule } from '@modules/department/department.module'
import { BullModule } from '@nestjs/bullmq'
import { Module, OnModuleInit } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsCommandHandlers } from './application/commands'
import { DEFECTIVE_GOODS_REPOSITORY } from './application/ports/defective-goods.repository.port'
import { DefectiveGoodsQueryHandlers } from './application/queries'
import { DefectiveGoodsSaga } from './application/sagas/defective-goods.saga'
import { DefectiveGoodsService } from './application/services/defective-goods.service'
import { DefectiveGoodsInboundService } from './application/services/defective-inbound.service'
import { DefectiveGoodsInventoryService } from './application/services/defective-inventory.service'
import { DefectiveGoodsOutboundService } from './application/services/defective-outbound.service'
import { DefectiveGoodsCdcHandlers } from './infrastructure/cdc'
import { DefectiveGoodsMongoRepository } from './infrastructure/persistence/mongodb/repositories/defective-goods.repository'
import {
	DefectiveGoods,
	DefectiveGoodsModel,
	DefectiveGoodsSchema
} from './infrastructure/persistence/mongodb/schemas/defective-goods.schema'
import { DefectiveGoodsEntity } from './infrastructure/persistence/mssql/entities/defective-goods.entity'
import { DEFECTIVE_GOODS_JOB_OPTIONS, DEFECTIVE_GOODS_SYNC_QUEUE } from './infrastructure/queues'
import { DefectiveGoodsConsumers } from './infrastructure/queues/consumers'
import { DefectiveGoodsController } from './presentation/controllers/defective-goods.controller'

@Module({
	imports: [
		CqrsModule,
		DepartmentModule,
		BullModule.registerQueue({ name: DEFECTIVE_GOODS_SYNC_QUEUE, defaultJobOptions: DEFECTIVE_GOODS_JOB_OPTIONS }),
		MongooseModule.forFeature(
			[{ name: DefectiveGoods.name, schema: DefectiveGoodsSchema }],
			DATA_WAREHOUSE_CONNECTION
		),
		TypeOrmModule.forFeature([DefectiveGoodsEntity], DATA_SOURCE_DATA_LAKE)
	],
	controllers: [DefectiveGoodsController],
	providers: [
		...DefectiveGoodsCommandHandlers,
		...DefectiveGoodsQueryHandlers,
		...DefectiveGoodsCdcHandlers,
		...DefectiveGoodsConsumers,
		{ provide: DEFECTIVE_GOODS_REPOSITORY, useClass: DefectiveGoodsMongoRepository },
		DefectiveGoodsSaga,
		DefectiveGoodsService,
		DefectiveGoodsInboundService,
		DefectiveGoodsOutboundService,
		DefectiveGoodsInventoryService
	]
})
export class DefectiveGoodsModule implements OnModuleInit {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel
	) {}

	async onModuleInit() {
		// Code to run on module initialization, if needed
		await this.defectiveGoodsModel.syncIndexes()
	}
}
