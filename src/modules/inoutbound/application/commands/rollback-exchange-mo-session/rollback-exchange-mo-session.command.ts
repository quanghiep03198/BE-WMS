import { Command } from '@nestjs/cqrs'

export class RollbackExchangeMoSessionCommand extends Command<any> {
	constructor(
		public readonly exchangeSkus: Array<string>,
		public readonly sourceMos: Array<string>,
		public readonly targetMo: string
	) {
		super()
	}
}
