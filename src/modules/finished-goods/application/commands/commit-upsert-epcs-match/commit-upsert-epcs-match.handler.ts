import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { COMMIT_UPSERT_EPC_MATCH_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CommitUpsertEpcsMatchCommand } from './commit-upsert-epcs-match.command'

@CommandHandler(CommitUpsertEpcsMatchCommand)
export class CommitUpsertEpcsMatchHandler implements ICommandHandler<CommitUpsertEpcsMatchCommand> {
	constructor(
		@InjectPinoLogger(CommitUpsertEpcsMatchHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(COMMIT_UPSERT_EPC_MATCH_QUEUE)
		private readonly commitUpsertEpcsMatchQueue: Queue<UpsertEpcsMatchData>
	) {}

	async execute({ data }: CommitUpsertEpcsMatchCommand): Promise<void> {
		try {
			await this.commitUpsertEpcsMatchQueue.add('UPSERT_EPCS_MATCH', data)
		} catch (error) {
			const err = error as Error
			this.logger.error(`Failed to add job to queue: ${err.message}`, err.stack)
		}
		// await this.ioMssqlRepository.upsertEpcsMatch(data)
	}
}
