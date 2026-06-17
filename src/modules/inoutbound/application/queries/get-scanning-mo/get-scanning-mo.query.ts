import { RFIDSearchParams } from '@/modules/inoutbound/infrastructure/types'
import { IQuery } from '@nestjs/cqrs'

export class GetScanningMOsQuery implements IQuery {
	constructor(
		public readonly params:
			| Required<Pick<RFIDSearchParams, 'inbound_device_sn.eq'>>
			| Required<Pick<RFIDSearchParams, 'outbound_device_sn.eq'>>
	) {}
}
