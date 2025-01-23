import { FileLogger } from '@/common/helpers/file-logger.helper'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Job, Queue } from 'bullmq'
import _ from 'lodash'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { TenancyService } from '../tenancy/tenancy.service'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import { FALLBACK_VALUE, POST_DATA_QUEUE } from './constants'
import { PostReaderDataDTO } from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { RFIDDataService } from './rfid.data.service'
import { StoredRFIDReaderItem } from './types'

@Processor(POST_DATA_QUEUE)
export class FPInventoryConsumer extends WorkerHost {
	constructor(
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		private readonly configService: ConfigService,
		private readonly eventEmitter: EventEmitter2,
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
				host: tenant.host,
				entities: [RFIDReaderEntity, RFIDMatchCustomerEntity]
			})
			if (!dataSource.isInitialized) await dataSource.initialize()

			const { data, sn } = job.data

			const deviceInformation = await dataSource.getRepository(RFIDReaderEntity).findOneBy({ device_sn: sn })
			// /* SQL */ `COALESCE(mo_no_actual, mo_no, :fallbackValue) AS mo_no`,
			const incommingEpcs = await dataSource
				.createQueryBuilder()
				.select([
					/* SQL */ `DISTINCT EPC_Code AS epc`,
					/* SQL */ `:fallbackValue AS mo_no`,
					/* SQL */ `COALESCE(mat_code, :fallbackValue) AS mat_code`,
					/* SQL */ `:stationNO AS station_no`,
					/* SQL */ `COALESCE(size_numcode, :fallbackValue) AS size_numcode`,
					/* SQL */ `GETDATE() AS record_time`
				])
				.from(/* SQL */ `DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust`, 'dv')
				.where(/* SQL */ `EPC_Code IN (:...epcs)`)
				.setParameters({
					fallbackValue: FALLBACK_VALUE,
					stationNO: deviceInformation.station_no,
					epcs: data.tagList.map((item) => item.epc)
				})
				.getRawMany<StoredRFIDReaderItem>()

			const validUnknownEpcs = incommingEpcs.filter(
				(item) => item.mo_no === FALLBACK_VALUE && !item.epc.startsWith('E28')
			)
			if (validUnknownEpcs.length > 0) {
				const uniqueEpcs = _.uniqBy(validUnknownEpcs, (item) => item.epc.substring(0, 22))
				this.thirdPartyApiSyncQueue.add(deviceInformation.factory_code, uniqueEpcs, { jobId: tenantId })
			}

			RFIDDataService.insertScannedEpcs(String(tenantId), incommingEpcs)
		} catch (e) {
			Logger.error(e)
			FileLogger.error(e)
		}
	}
}
