import { Command } from '@nestjs/cqrs'

/**
 * @description Command to exchange manufacturing orders (MOs) in the MSSQL database (Read Model). It contains the necessary information to perform the exchange operation, including the device serial number, source MOs, and target MO.
 * @class ExchangeMoRmCommand
 * @extends {Command<void>}
 */
export class ExchangeMoRmCommand extends Command<void> {
	constructor(
		public readonly deviceSerialNumber: string,
		public readonly sourceMos: string[],
		public readonly targetMo: string
	) {
		super()
	}
}
