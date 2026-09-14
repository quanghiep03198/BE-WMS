import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { InjectTransactionHost, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { ROLLBACK_STOCK_TX_QUEUE } from '..'

@Processor(ROLLBACK_STOCK_TX_QUEUE)
export class RollbackStockTxConsumer extends WorkerHost {
	constructor(
		@InjectTransactionHost(DATA_SOURCE_DATA_LAKE)
		private readonly txHostDL: TransactionHost<TransactionalAdapterTypeOrm>
	) {
		super()
	}

	public async process(job: Job<Array<{ epc: string; status: FinishedGoodsEpcStatus }>>): Promise<void> {
		const statusMap: Map<
			FinishedGoodsEpcStatus,
			{ status: 'A'; station: '101' } | { status: 'B'; station: '101' | '103' }
		> = new Map([
			[FinishedGoodsEpcStatus.IN_STOCK, { status: 'A', station: '101' }],
			[FinishedGoodsEpcStatus.RECALLED, { status: 'B', station: '101' }],
			[FinishedGoodsEpcStatus.SHIPPED, { status: 'B', station: '103' }]
		])

		const paramter = JSON.stringify(
			job.data.map((item) => ({
				epc: item.epc,
				status: statusMap.get(item.status).status,
				station: statusMap.get(item.status).station
			}))
		)

		await this.txHostDL.tx.query(
			/* SQL */ `
         DELETE a
         FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS a
         INNER JOIN (
            SELECT JSON_VALUE(value, '$.epc') AS EPC_Code,
               JSON_VALUE(value, '$.status') AS rfid_status,
               JSON_VALUE(value, '$.station') AS station_suffix
            FROM OPENJSON(@0)
         ) AS b 
         ON a.EPC_Code = b.EPC_Code 
            AND a.rfid_status = b.rfid_status 
            AND a.station_suffix = b.station_suffix
         `,
			[paramter]
		)

		await this.txHostDL.tx.query(
			/* SQL */ `
         DELETE a
         FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS a
         INNER JOIN (
            SELECT JSON_VALUE(value, '$.epc') AS EPC_Code,
               JSON_VALUE(value, '$.status') AS rfid_status,
               JSON_VALUE(value, '$.station') AS station_suffix
            FROM OPENJSON(@0)
         ) AS b 
         ON a.EPC_Code = b.EPC_Code 
            AND a.rfid_status = b.rfid_status 
            AND a.station_suffix = b.station_suffix
         WHERE CAST(a.record_time AS DATE) = CAST(GETDATE() AS DATE)
         `,
			[paramter]
		)
	}
}
