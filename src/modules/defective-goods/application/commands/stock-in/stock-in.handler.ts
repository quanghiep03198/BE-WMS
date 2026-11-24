import { NoDefectiveGoodsToStockInException } from '@modules/defective-goods/domain/exceptions'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import chunk from 'lodash/chunk'
import { setImmediate } from 'node:timers/promises'
import { DefectiveGoodsStockReportHandler } from '../../events/defective-goods-stock-report.handler'
import {
	DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK,
	IDefectiveGoodsStockUnitOfWork
} from '../../ports/defective-goods-stock-unit-of-work.port'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { StockInDefectiveGoodsCommand } from './stock-in.command'

@CommandHandler(StockInDefectiveGoodsCommand)
export class StockInDefectiveGoodsHandler implements ICommandHandler<StockInDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher,
		@Inject(DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK) private readonly unitOfWork: IDefectiveGoodsStockUnitOfWork,
		private readonly reportHandler: DefectiveGoodsStockReportHandler
	) {}
	async execute({ data, updatedBy, filters = {}, take = 0 }: StockInDefectiveGoodsCommand) {
		const pendingStockInItems = await this.repository.findPendingStockIn(
			{ ...filters, combination_strategy: data.combination_strategy },
			data.epcs,
			take
		)
		if (pendingStockInItems.length === 0) throw new NoDefectiveGoodsToStockInException()

		const CHUNK_SIZE = 1000

		for (const part of chunk(pendingStockInItems, CHUNK_SIZE)) {
			part.forEach((model) => {
				model.stockIn(data.storage_location, updatedBy)
			})
			await this.unitOfWork.execute(async (transaction) => {
				await transaction.stockIn(part)
				await this.reportHandler.handle(part, transaction)
			})
			part.forEach((model) => this.eventPublisher.mergeObjectContext(model).commit())

			await setImmediate()
		}
	}
}
