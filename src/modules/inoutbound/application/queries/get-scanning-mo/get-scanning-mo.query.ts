import { IQuery } from '@nestjs/cqrs'

export class GetScanningMosQuery implements IQuery {
	constructor(
		public readonly params: Record<'inbound_device_sn.eq', string> | Record<'outbound_device_sn.eq', string>
	) {}
}
