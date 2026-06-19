import { Inject } from '@nestjs/common'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { IInoutboundMssqlRepository, IO_MSSQL_REPOSITORY } from '../../repositories/io-mssql.repository.interface'
import { RollbackMssqlInboundDataEvent } from './rollback-mssql-inbound-data.event'

@EventsHandler(RollbackMssqlInboundDataEvent)
export class RollbackMssqlInboundDataHandler implements IEventHandler<RollbackMssqlInboundDataEvent> {
	constructor(@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IInoutboundMssqlRepository) {}

	public async handle() {}
}
