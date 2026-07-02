import { Command } from '@nestjs/cqrs'

export class ExchangeMoMssqlCommand extends Command<any> {
	constructor(
		public readonly deviceSerialNumber: string,
		public readonly sourceMos: string[],
		public readonly targetMo: string
	) {
		super()
	}
}
