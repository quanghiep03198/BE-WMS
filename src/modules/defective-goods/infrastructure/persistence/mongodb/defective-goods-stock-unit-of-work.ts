import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DEFECTIVE_GOODS_REPORT_REPOSITORY } from '@modules/defective-goods/application/ports/defective-goods-report.repository.port'
import {
	IDefectiveGoodsStockTransaction,
	IDefectiveGoodsStockUnitOfWork
} from '@modules/defective-goods/application/ports/defective-goods-stock-unit-of-work.port'
import { DEFECTIVE_GOODS_REPOSITORY } from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import { Inject, Injectable } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'
import { DefectiveGoodsReportRepository } from './repositories/defective-goods-report.repository'
import { DefectiveGoodsRepository } from './repositories/defective-goods.repository'

@Injectable()
export class DefectiveGoodsMongoStockUnitOfWork implements IDefectiveGoodsStockUnitOfWork {
	constructor(
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection,
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly goods: DefectiveGoodsRepository,
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY) private readonly reports: DefectiveGoodsReportRepository
	) {}

	async execute<T>(work: (transaction: IDefectiveGoodsStockTransaction) => Promise<T>): Promise<T> {
		const session = await this.connection.startSession()
		try {
			return await session.withTransaction(
				() =>
					work({
						stockIn: (models) => this.goods.stockIn(models, session),
						stockOut: (models) => this.goods.stockOut(models, session),
						mergeStockEvents: (events) => this.reports.mergeStockEvents(events, session)
					}),
				{ readPreference: 'primary', writeConcern: { w: 'majority' } }
			)
		} finally {
			await session.endSession()
		}
	}
}
