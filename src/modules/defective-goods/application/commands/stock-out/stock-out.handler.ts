import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { CombinationStrategy } from '@modules/defective-goods/domain/constants'
import { DefectiveGoodsNotFound } from '@modules/defective-goods/domain/exceptions'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import chunk from 'lodash/chunk'
import { setImmediate } from 'node:timers/promises'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { StockOutDefectiveGoodsCommand } from './stock-out.command'

@CommandHandler(StockOutDefectiveGoodsCommand)
export class StockOutDefectiveGoodsHandler implements ICommandHandler<StockOutDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly defectiveGoodsRepository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ data, updatedBy, filters, take }: StockOutDefectiveGoodsCommand) {
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
		const limit = data.combination_strategy !== CombinationStrategy.MANUALLY ? take : undefined
		const pendingStockOutItems = await this.defectiveGoodsRepository.find(filterQuery, null, { limit })
		if (pendingStockOutItems.length === 0) throw new DefectiveGoodsNotFound()
		const outboundDate = new Date()
		const CHUNK_SIZE = 1000
		for (const part of chunk(pendingStockOutItems, CHUNK_SIZE)) {
			part.forEach((model) => {
				model.stockOut(data.outbound_purpose, updatedBy, data.po, outboundDate)
				this.eventPublisher.mergeObjectContext(model)
			})
			await this.defectiveGoodsRepository.stockOut(part)
			part.forEach((model) => model.commit())
			await setImmediate()
		}
	}
}
