import { Command } from '@nestjs/cqrs'

/**
 * @description Command to exchange manufacturing orders (MOs) in the MongoDB database (Write Model). It contains the necessary information to perform the exchange operation, including the pending exchange SKUs and the target MO.
 * @class ExchangeMoWmCommand
 * @extends {Command<void>}
 */
export class ExchangeMoWmCommand extends Command<void> {
	constructor(
		public readonly pendingExchangeEpcs: Array<string>,
		public readonly targetMo: string
	) {
		super()
	}
}
