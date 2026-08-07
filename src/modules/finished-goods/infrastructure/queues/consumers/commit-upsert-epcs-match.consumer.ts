import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_UPSERT_EPC_MATCH_QUEUE as COMMIT_UPSERT_EPCS_MATCH_QUEUE } from '..'

@Processor(COMMIT_UPSERT_EPCS_MATCH_QUEUE)
export class CommitUpsertEpcsMatchConsumer extends WorkerHost {
	constructor(@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository) {
		super()
	}

	public async process(job: Job<UpsertEpcsMatchData>): Promise<void> {
		await this.ioMssqlRepository.upsertEpcsMatch(job.data, false)
	}
}
