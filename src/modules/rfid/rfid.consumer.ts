import { FileLogger } from '@/common/helpers/file-logger.helper'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job } from 'bullmq'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { TenancyService } from '../tenancy/tenancy.service'
import { POST_DATA_QUEUE } from './constants'
import { PostReaderDataDTO } from './dto/rfid.dto'
import { RFIDDataService } from './rfid.data.service'
import { StoredRFIDReaderItem } from './types'

@Processor(POST_DATA_QUEUE)
export class RFIDConsumer extends WorkerHost {
	constructor(
		private readonly configService: ConfigService,
		private readonly tenancyService: TenancyService
	) {
		super()
	}

	async process(job: Job<PostReaderDataDTO, void, string>): Promise<any> {
		try {
			const tenantId = job.name
			const tenant = this.tenancyService.findOneById(tenantId)
			const dataSource = new DataSource({
				...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
				host: tenant.host
			})
			if (!dataSource.isInitialized) await dataSource.initialize()

			const { data, sn } = job.data
			const incommingEpcs = await dataSource.query<StoredRFIDReaderItem[]>(
				/* SQL */ `
					SELECT 
						DISTINCT EPC_Code AS epc, 
						COALESCE(mo_no_actual, mo_no, 'Unknown') AS mo_no,
						reader.station_no,
						GETDATE() AS record_time
					FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
					OUTER APPLY (
						SELECT device_name AS station_no
						FROM DV_DATA_LAKE.dbo.dv_rfidreader
						WHERE device_sn = @1
					) reader
					WHERE EPC_Code IN (
						SELECT value AS EPC_Code
						FROM STRING_SPLIT(@0, ',')
					)
				`,
				[data.tagList.map((item) => item.epc).join(','), sn]
			)

			RFIDDataService.insertInvScannedEpcs(String(tenantId), incommingEpcs)
		} catch (e) {
			Logger.error(e)
			FileLogger.error(e)
		}
	}
}
