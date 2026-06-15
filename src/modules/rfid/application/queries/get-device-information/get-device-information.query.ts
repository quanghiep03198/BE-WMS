import { IQuery } from '@nestjs/cqrs'

export class GetDeviceInformationQuery implements IQuery {
	constructor(public readonly deviceSerialNumber: string) {}
}
