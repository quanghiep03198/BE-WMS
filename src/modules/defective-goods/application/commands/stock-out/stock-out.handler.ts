import { DefectiveGoodsNotFound } from '@modules/defective-goods/domain/exceptions'
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
import { StockOutDefectiveGoodsCommand } from './stock-out.command'

@CommandHandler(StockOutDefectiveGoodsCommand)
export class StockOutDefectiveGoodsHandler implements ICommandHandler<StockOutDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher,
		@Inject(DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK) private readonly unitOfWork: IDefectiveGoodsStockUnitOfWork,
		private readonly reportHandler: DefectiveGoodsStockReportHandler
	) {}

	async execute({ data, updatedBy, filters, take }: StockOutDefectiveGoodsCommand) {
		const pendingStockOutItems = await this.repository.findPendingStockOut(
			{ ...filters, combination_strategy: data.combination_strategy },
			data.epcs,
			take
		)
		if (pendingStockOutItems.length === 0) throw new DefectiveGoodsNotFound()
		const CHUNK_SIZE = 1000
		for (const part of chunk(pendingStockOutItems, CHUNK_SIZE)) {
			part.forEach((model) => {
				model.stockOut(data.outbound_purpose, data.po, updatedBy)
				this.eventPublisher.mergeObjectContext(model)
			})
			await this.unitOfWork.execute(async (transaction) => {
				await transaction.stockOut(part)
				await this.reportHandler.handle(part, transaction)
			})
			part.forEach((model) => model.commit())
			await setImmediate()
		}
	}
}
