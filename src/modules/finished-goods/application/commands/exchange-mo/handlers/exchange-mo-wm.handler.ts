import { COMMIT_EXCHANGE_MO_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExchangeMoWmCommand } from '../impl/exchange-mo-wm.command'

@CommandHandler(ExchangeMoWmCommand)
export class ExchangeMoWmHandler implements ICommandHandler<ExchangeMoWmCommand> {
	constructor(
		@InjectPinoLogger(ExchangeMoWmHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(COMMIT_EXCHANGE_MO_QUEUE)
		private readonly commitExchangeMoQueue: Queue<{ pendingExchangeEpcs: string[]; targetMo: string }>
	) {}

	public async execute(command: ExchangeMoWmCommand): Promise<void> {
		try {
			// TODO: add to bullMQ to handle the exchange manufacturing order process in the background
			await this.commitExchangeMoQueue.add(`EXCHANGE_MO:${command.targetMo}`, command)
		} catch (error) {
			this.logger.error(error)
		}
	}
}
