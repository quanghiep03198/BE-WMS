import {
	IInoutboundMssqlRepository,
	INOUTBOUND_MSSQL_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/rfid.repository.interface'
import { Inject } from '@nestjs/common'
import { ICommandHandler } from '@nestjs/cqrs'
import { InboundCommand } from './inbound.command'

export class InboundHandler implements ICommandHandler<InboundCommand> {
	constructor(
		@Inject(INOUTBOUND_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IInoutboundMssqlRepository
	) {}

	public async execute(command: InboundCommand): Promise<void> {}
}
