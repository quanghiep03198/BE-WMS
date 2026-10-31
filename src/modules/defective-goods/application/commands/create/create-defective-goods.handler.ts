import { DefectiveGoodsDomainModel } from '@modules/defective-goods/domain/models/defective-goods.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import chunk from 'lodash/chunk'
import { setImmediate } from 'node:timers/promises'
import { DEFECTIVE_GOODS_CACHE_REPOSITORY } from '../../ports/defective-goods-cache.port'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { CreateDefectiveGoodsCommand } from './create-defective-goods.command'

@CommandHandler(CreateDefectiveGoodsCommand)
export class CreateDefectiveGoodsHandler implements ICommandHandler<CreateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		@Inject(DEFECTIVE_GOODS_CACHE_REPOSITORY)
		private readonly cacheRepository: any,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ payload, createdBy }: CreateDefectiveGoodsCommand) {
		const defectiveGoods = DefectiveGoodsDomainModel.create({
			...payload,
			created_by: createdBy
		} as FirstParameter<typeof DefectiveGoodsDomainModel.create>)
		for (const part of chunk(defectiveGoods)) {
			const created = await this.repository.create(part)
			for (const model of created) {
				model.insert()
				this.eventPublisher.mergeObjectContext(model).commit()
			}
			await setImmediate()
		}
		await this.cacheRepository.flushCount()
	}
}
