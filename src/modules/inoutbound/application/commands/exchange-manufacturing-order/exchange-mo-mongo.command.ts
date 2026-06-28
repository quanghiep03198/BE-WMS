import { Command } from '@nestjs/cqrs'

export class ExchangeMoMongoCommand extends Command<any> {
	constructor() {
		super()
	}
}
