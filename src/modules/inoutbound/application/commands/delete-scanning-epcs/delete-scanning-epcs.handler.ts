import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/application/ports/io-mongo.repository.port'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DeleteScanningEpcsCommand } from './delete-scanning-epcs.command'

@CommandHandler(DeleteScanningEpcsCommand)
export class DeleteScanningEpcsHandler implements ICommandHandler<DeleteScanningEpcsCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly inoutboundMongoRepository: IIoMongoRepository
	) {}

	public async execute({ inventoryAction, scanningEpcs, rescannable }: DeleteScanningEpcsCommand) {
		return await this.inoutboundMongoRepository.bulkDeleteEpcs(inventoryAction, scanningEpcs, rescannable)
	}
}
