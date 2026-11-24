import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DepartmentModule } from '@modules/department/department.module'
import { FilesModule } from '@modules/files/files.module'
import { BullModule } from '@nestjs/bullmq'
import { Module, OnModuleInit } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsCommandHandlers } from './application/commands'
import { DefectiveGoodsStockReportHandler } from './application/events/defective-goods-stock-report.handler'
import { DEFECTIVE_GOODS_REPORT_REPOSITORY } from './application/ports/defective-goods-report.repository.port'
import { DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK } from './application/ports/defective-goods-stock-unit-of-work.port'
import { DEFECTIVE_GOODS_REPOSITORY } from './application/ports/defective-goods.repository.port'
import { DefectiveGoodsQueryHandlers } from './application/queries'
import { DefectiveGoodsSaga } from './application/sagas/defective-goods.saga'
import { DefectiveGoodsCdcHandlers } from './infrastructure/cdc'
import { DefectiveGoodsMongoStockUnitOfWork } from './infrastructure/persistence/mongodb/defective-goods-stock-unit-of-work'
import { DefectiveGoodsReportRepository } from './infrastructure/persistence/mongodb/repositories/defective-goods-report.repository'
import { DefectiveGoodsRepository } from './infrastructure/persistence/mongodb/repositories/defective-goods.repository'
import {
	DefectiveGoodsDailyReport,
	DefectiveGoodsDailyReportModel,
	DefectiveGoodsDailyReportSchema
} from './infrastructure/persistence/mongodb/schemas/defective-goods-daily-report.schema'
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
		FilesModule,
		DepartmentModule,
		BullModule.registerQueue({ name: DEFECTIVE_GOODS_SYNC_QUEUE, defaultJobOptions: DEFECTIVE_GOODS_JOB_OPTIONS }),
		MongooseModule.forFeature(
			[
				{ name: DefectiveGoods.name, schema: DefectiveGoodsSchema },
				{ name: DefectiveGoodsDailyReport.name, schema: DefectiveGoodsDailyReportSchema }
			],
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
		{ provide: DEFECTIVE_GOODS_REPOSITORY, useClass: DefectiveGoodsRepository },
		{ provide: DEFECTIVE_GOODS_REPORT_REPOSITORY, useClass: DefectiveGoodsReportRepository },
		{ provide: DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK, useClass: DefectiveGoodsMongoStockUnitOfWork },
		DefectiveGoodsSaga,
		DefectiveGoodsStockReportHandler
	]
})
export class DefectiveGoodsModule implements OnModuleInit {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel,
		@InjectModel(DefectiveGoodsDailyReport.name, DATA_WAREHOUSE_CONNECTION)
		private readonly reportModel: DefectiveGoodsDailyReportModel
	) {}

	async onModuleInit() {
		// Code to run on module initialization, if needed
		await this.defectiveGoodsModel.syncIndexes()
		await this.reportModel.createIndexes()
	}
}
