import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DeleteScanningEpcsCommand } from './delete-scanning-epcs.command'

@CommandHandler(DeleteScanningEpcsCommand)
export class DeleteScanningEpcsHandler implements ICommandHandler<DeleteScanningEpcsCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly inoutboundMongoRepository: IInoutboundMongoRepository
	) {}

	public async execute({ inventoryAction, scanningEpcs, rescannable }: DeleteScanningEpcsCommand) {
		return await this.inoutboundMongoRepository.bulkDeleteEpcs(inventoryAction, scanningEpcs, rescannable)
	}
}
