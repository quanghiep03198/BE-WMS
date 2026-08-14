import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { PinoLogger } from 'nestjs-pino'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository
	) {}

	public async execute({ command }: BulkWriteInventoryCommand) {
		const { data, sn } = command.payload

		const scanningEpcs = await this.ioMongoRepository.getEpcsInformation(data.tagList.map((tag) => tag.epc))

		if (scanningEpcs.length === 0) return

		await this.ioMongoRepository.bulkWriteInventoryEpcs({
			action: command.action,
			payload: {
				epcs: scanningEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
