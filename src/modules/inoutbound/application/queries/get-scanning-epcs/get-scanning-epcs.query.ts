import { RFIDSearchParams } from '@/modules/inoutbound/infrastructure/types'
import { IQuery } from '@nestjs/cqrs'

export class GetScanningEpcsQuery implements IQuery {
	constructor(public readonly params: RFIDSearchParams) {}
}
