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
		const useVirtualEpcs = data.combination_strategy !== CombinationStrategy.MANUALLY

		const filterQuery = MongoQueryBuilder.from({ ...filters, combination_strategy: data.combination_strategy })
			.when(!useVirtualEpcs, (qb) => qb.whereIn('epc', data.epcs))
			.when(useVirtualEpcs, (qb) =>
				qb
					.whereEqual('brand_name')
					.whereEqual('defective_category')
					.whereEqual('epc')
					.whereEqual('po')
					.whereEqual('mo_no')
					.whereEqual('factory_shoes_style')
					.whereEqual('color_sn')
					.whereEqual('size_numcode')
			)
			.whereFieldsAreNotNull('inbound_at', 'storage_location')
			.build()
		const options = useVirtualEpcs ? { limit: take } : {}

		const pendingStockOutItems = await this.defectiveGoodsRepository.find(filterQuery, null, options)
		if (pendingStockOutItems.length === 0) throw new DefectiveGoodsNotFound()
		const CHUNK_SIZE = 1000
		for (const part of chunk(pendingStockOutItems, CHUNK_SIZE)) {
			part.forEach((model) => {
				model.stockOut(data.outbound_purpose, data.po, updatedBy)
				this.eventPublisher.mergeObjectContext(model)
			})
			await this.defectiveGoodsRepository.stockOut(part)
			part.forEach((model) => model.commit())
			await setImmediate()
		}
	}
}
