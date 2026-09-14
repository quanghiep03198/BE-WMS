import {
	FINISHED_GOODS_EPC_REPOSITORY,
	IFinishedGoodsEpcRepository
} from '@modules/finished-goods/application/ports/finished-goods-epc.repository.port'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		@Inject(FINISHED_GOODS_EPC_REPOSITORY) private readonly epcMongoRepository: IFinishedGoodsEpcRepository
	) {}

	public async execute({ command }: BulkWriteInventoryCommand) {
		const { data, sn } = command.payload

		const scanningEpcs = await this.epcMongoRepository.getEpcsInformation(data.tagList.map((tag) => tag.epc))

		if (scanningEpcs.length === 0) return

		await this.epcMongoRepository.bulkWriteInventoryEpcs({
			action: command.action,
			payload: {
				epcs: scanningEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
