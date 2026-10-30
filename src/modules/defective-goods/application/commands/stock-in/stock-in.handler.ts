import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { CombinationStrategy } from '@modules/defective-goods/domain/constants'
import { NoDefectiveGoodsToStockInException } from '@modules/defective-goods/domain/exceptions'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { StockInDefectiveGoodsCommand } from './stock-in.command'

@CommandHandler(StockInDefectiveGoodsCommand)
export class StockInDefectiveGoodsHandler implements ICommandHandler<StockInDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}
	async execute({ data, updatedBy, filters = {}, take = 0 }: StockInDefectiveGoodsCommand) {
		const filterQuery = MongoQueryBuilder.from({ ...filters, combination_strategy: data.combination_strategy })
			.when(data.combination_strategy !== CombinationStrategy.MANUALLY, (qb) => qb.whereIn('epc', data.epcs))
			.when(data.combination_strategy === CombinationStrategy.MANUALLY, (qb) =>
				qb
					.whereEqual('brand_name')
					.whereEqual('defective_category')
					.whereContains('epc')
					.whereContains('po')
					.whereContains('mo_no')
					.whereContains('factory_shoes_style')
					.whereContains('color_sn')
					.whereContains('size_numcode')
			)
			.build()
		const pendingStockInItems = await this.repository.findAll(filterQuery, take)
		if (pendingStockInItems.length === 0) throw new NoDefectiveGoodsToStockInException()
		pendingStockInItems.forEach((model) => {
			model.stockIn(data.storage_location, updatedBy._id)
			this.eventPublisher.mergeObjectContext(model)
		})
		await this.repository.stockIn(pendingStockInItems)
		pendingStockInItems.forEach((model) => model.commit())
	}
}
