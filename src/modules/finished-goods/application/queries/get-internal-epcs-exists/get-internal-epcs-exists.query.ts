import { IQuery } from '@nestjs/cqrs'

export class GetInternalEpcsExistsQuery implements IQuery {
	constructor(public readonly params: { 'inbound_device_sn:eq': string } | { 'outbound_device_sn:eq': string }) {}
}
