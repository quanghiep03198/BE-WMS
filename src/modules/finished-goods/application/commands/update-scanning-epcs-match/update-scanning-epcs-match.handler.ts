import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { UpdateScanningEpcsMatchCommand } from './update-scanning-epcs-match.command'

@CommandHandler(UpdateScanningEpcsMatchCommand)
export class UpdateScanningEpcsMatchHandler implements ICommandHandler<UpdateScanningEpcsMatchCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly ioMongoRepository: IIoMongoRepository
	) {}

	async execute({ data }: UpdateScanningEpcsMatchCommand): Promise<void> {
		await this.ioMongoRepository.updateScanningEpcsMatch(data)
	}
}
