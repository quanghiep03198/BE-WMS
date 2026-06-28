import { Command } from '@nestjs/cqrs'

export class ExchangeMoMssqlCommand extends Command<any> {
	constructor(
		public readonly sourceMos: string[],
		public readonly factoryShoeStyle: string,
		public readonly color: string,
		public readonly targetMo: string
	) {
		super()
	}
}
