import {
	IEpcChangeStreamFactory,
	MONGO_EPC_CHANGE_STREAM_FACTORY
} from '@modules/finished-goods/domain/interfaces/epc-change-stream.factory.interface'
import { IEpcChangeStream } from '@modules/finished-goods/domain/interfaces/epc-change-stream.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CreateEpcChangeStreamCommand } from './create-epc-change-stream.command'

@CommandHandler(CreateEpcChangeStreamCommand)
export class CreateEpcChangeStreamHandler implements ICommandHandler<CreateEpcChangeStreamCommand, IEpcChangeStream> {
	constructor(
		@Inject(MONGO_EPC_CHANGE_STREAM_FACTORY) private readonly epcChangeStreamFactory: IEpcChangeStreamFactory
	) {}

	public async execute({ filterQuery, onChange }: CreateEpcChangeStreamCommand): Promise<IEpcChangeStream> {
		return await this.epcChangeStreamFactory.create(filterQuery, onChange)
	}
}
