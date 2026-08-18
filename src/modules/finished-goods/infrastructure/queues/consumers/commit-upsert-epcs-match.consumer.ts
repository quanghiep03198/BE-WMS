import { CdcEchoRegistryService } from '@databases/cdc/services/cdc-echo-registery.service'
import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import {
	IMssqlFinishedGoodsRepository,
	MSSQL_FINISHED_GOODS_REPOSITORY
} from '@modules/finished-goods/application/ports/mssql-finished-goods.repository.port'
import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_UPSERT_EPC_MATCH_QUEUE as COMMIT_UPSERT_EPCS_MATCH_QUEUE } from '..'

@Processor(COMMIT_UPSERT_EPCS_MATCH_QUEUE)
export class CommitUpsertEpcsMatchConsumer extends WorkerHost {
	constructor(
		@Inject(MSSQL_FINISHED_GOODS_REPOSITORY)
		private readonly mssqlFinishedGoodsRepository: IMssqlFinishedGoodsRepository,
		private readonly cdcEchoRegisterService: CdcEchoRegistryService
	) {
		super()
	}

	public async process(job: Job<UpsertEpcsMatchData>): Promise<void> {
		this.cdcEchoRegisterService.registerOrigin(
			DATA_SOURCE_DATA_LAKE,
			'dbo',
			'dv_rfidmatchmst_cust',
			job.id.toString(),
			60_000
		)
		await this.mssqlFinishedGoodsRepository.upsertEpcsMatch(job.data, false)
	}
}
