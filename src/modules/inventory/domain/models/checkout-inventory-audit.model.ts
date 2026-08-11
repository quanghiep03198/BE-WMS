import { AggregateRoot } from '@nestjs/cqrs'

export class CheckOutInventoryAuditModel extends AggregateRoot {
	constructor(private readonly month: `${number}-${number}`) {
		super()
	}

	execute() {}
}
