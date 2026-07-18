import { IQuery } from '@nestjs/cqrs'

export class GetInternalEpcsExistsQuery implements IQuery {
	constructor(public readonly deviceSerialNumber: string) {}
}
