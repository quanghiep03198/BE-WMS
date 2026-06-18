import { AggregateRoot } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../entities/epc.entity'
import { StockedInEvent } from '../events/stocked-in/stocked-in.event'

export class Stock extends AggregateRoot {
	constructor() {
		super()
	}

	public stockedIn(epcs: Array<ElectronicProductCode>) {
		this.apply(new StockedInEvent(epcs))
	}
}
