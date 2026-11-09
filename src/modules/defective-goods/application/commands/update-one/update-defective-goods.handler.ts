import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DefectiveGoodsNotFound } from '@modules/defective-goods/domain/exceptions'
import { DefectiveGoodsDomainModel } from '@modules/defective-goods/domain/models/defective-goods.model'
import { FilesService } from '@modules/files/files.service'
import { HtmlSanitizerService } from '@modules/files/html-sanitizer.service'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { UpdateDefectiveGoodsCommand } from './update-defective-goods.command'

@CommandHandler(UpdateDefectiveGoodsCommand)
export class UpdateDefectiveGoodsHandler implements ICommandHandler<UpdateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher,
		private readonly files: FilesService,
		private readonly sanitizer: HtmlSanitizerService,
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection
	) {}
	async execute({ id, update, updatedBy }: UpdateDefectiveGoodsCommand) {
		const session = await this.connection.startSession()
		let defectiveGoods: DefectiveGoodsDomainModel
		try {
			await session.withTransaction(
				async () => {
					defectiveGoods = await this.repository.findById(id, session)
					if (!defectiveGoods) throw new DefectiveGoodsNotFound()
					if (update.defective_description !== undefined) {
						const { html, imageIds } = this.sanitizer.sanitize(update.defective_description)
						await this.files.syncImageRefs(
							`defective-goods:${id}`,
							defectiveGoods.toProps().description_image_ids ?? [],
							imageIds,
							session
						)
						defectiveGoods.update(
							{ ...update, defective_description: html, description_image_ids: imageIds },
							updatedBy
						)
					} else {
						defectiveGoods.update(update, updatedBy)
					}
					await this.repository.updateById(id, defectiveGoods, session)
				},
				{ readPreference: 'primary' }
			)
		} finally {
			await session.endSession()
		}
		this.eventPublisher.mergeObjectContext(defectiveGoods)
		defectiveGoods.commit()
	}
}
