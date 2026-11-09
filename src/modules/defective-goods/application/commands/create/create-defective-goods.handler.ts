import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DefectiveGoodsDomainModel } from '@modules/defective-goods/domain/models/defective-goods.model'
import { FilesService } from '@modules/files/files.service'
import { HtmlSanitizerService } from '@modules/files/html-sanitizer.service'
import { Inject, Logger } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectConnection } from '@nestjs/mongoose'
import chunk from 'lodash/chunk'
import { Connection } from 'mongoose'
import { setImmediate } from 'node:timers/promises'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { CreateDefectiveGoodsCommand } from './create-defective-goods.command'

@CommandHandler(CreateDefectiveGoodsCommand)
export class CreateDefectiveGoodsHandler implements ICommandHandler<CreateDefectiveGoodsCommand> {
	private readonly logger = new Logger(CreateDefectiveGoodsHandler.name)

	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher,
		private readonly files: FilesService,
		private readonly sanitizer: HtmlSanitizerService,
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection
	) {}

	async execute({ payload, createdBy }: CreateDefectiveGoodsCommand) {
		const { html, imageIds } = this.sanitizer.sanitize(payload.defective_description)
		const defectiveGoods = DefectiveGoodsDomainModel.create({
			...payload,
			defective_description: html,
			description_image_ids: imageIds,
			created_by: createdBy
		} as FirstParameter<typeof DefectiveGoodsDomainModel.create>)

		for (const part of chunk(defectiveGoods)) {
			const session = await this.connection.startSession()
			let created: DefectiveGoodsDomainModel[] = []
			try {
				await session.withTransaction(
					async () => {
						created = await this.repository.create(part, session)
						for (const model of created)
							await this.files.syncImageRefs(`defective-goods:${model.id}`, [], imageIds, session)
					},
					{ readPreference: 'primary' }
				)
			} finally {
				await session.endSession()
			}
			created.forEach((model) => {
				model.insert()
				this.eventPublisher.mergeObjectContext(model).commit()
			})
			await setImmediate()
		}
	}
}
