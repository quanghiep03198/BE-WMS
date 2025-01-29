import { FileLogger } from '@/common/helpers/file-logger.helper'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job, Queue } from 'bullmq'
import _ from 'lodash'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { TenancyService } from '../tenancy/tenancy.service'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import { EXCLUDED_ORDERS, FALLBACK_VALUE, POST_DATA_QUEUE } from './constants'
import { PostReaderDataDTO } from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { RFIDDataService } from './rfid.data.service'
import { StoredRFIDReaderItem } from './types'

@Processor({ name: POST_DATA_QUEUE, scope: Scope.REQUEST })
export class FPInventoryConsumer extends WorkerHost {
	private readonly dataSources: Map<string, DataSource> = new Map()

	constructor(
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		private readonly configService: ConfigService,
		private readonly tenancyService: TenancyService
	) {
		super()
	}

	/**
	 * @public
	 * @description Process the incoming data from the RFID reader
	 * @param {Job<PostReaderDataDTO, void, string>} job
	 */
	public async process(job: Job<PostReaderDataDTO, void, string>): Promise<void> {
		try {
			const tenantId = job.name
			const { data, sn } = job.data

			const dataSource = await this.getOrCreateDataSource(tenantId)

			// * Get the RFID reader information from the database
			const deviceInformation = await dataSource.getRepository(RFIDReaderEntity).findOneBy({ device_sn: sn })

			// * Get the EPCs information from the database with received data
			const incommingEpcs = await dataSource
				.getRepository(RFIDMatchCustomerEntity)
				.createQueryBuilder()
				.select([
					/* SQL */ `DISTINCT EPC_Code AS epc`,
					/* SQL */ `COALESCE(mo_no_actual, mo_no, :fallbackValue) AS mo_no`,
					/* SQL */ `COALESCE(mat_code, :fallbackValue) AS mat_code`,
					/* SQL */ `COALESCE(shoestyle_codefactory, :fallbackValue) AS shoes_style_code_factory`,
					/* SQL */ `COALESCE(size_numcode, :fallbackValue) AS size_numcode`,
					/* SQL */ `:stationNO AS station_no`,
					/* SQL */ `GETDATE() AS record_time`
				])
				.where(/* SQL */ `EPC_Code IN (:...epcs)`)
				.andWhere(/* SQL */ `mo_no NOT IN (:...excludedOrders)`)
				.setParameters({
					fallbackValue: FALLBACK_VALUE,
					stationNO: deviceInformation.station_no,
					epcs: data.tagList.map((item) => item.epc),
					excludedOrders: EXCLUDED_ORDERS
				})
				.getRawMany<StoredRFIDReaderItem>()

			// * Check if EPC have no information, trigger queue to fetch from third party API
			const validUnknownEpcs = incommingEpcs.filter(
				(item) => item.mo_no === FALLBACK_VALUE && !item.epc.startsWith('E28')
			)
			if (validUnknownEpcs.length > 0) {
				const uniqueEpcs = _.uniqBy(validUnknownEpcs, (item) => item.epc.substring(0, 22)).map((item) => item.epc)
				this.thirdPartyApiSyncQueue.add(deviceInformation.factory_code, uniqueEpcs, {
					jobId: tenantId,
					attempts: 3,
					backoff: {
						type: 'exponential',
						delay: 3000
					}
				})
			}

			await RFIDDataService.insertScannedEpcs(String(tenantId), incommingEpcs)
		} catch (e) {
			Logger.error(e)
			FileLogger.error(e)
		}
	}

	/**
	 * @private
	 * @description Get or create a new data source for the tenant
	 * @param {string} tenantId
	 */
	private async getOrCreateDataSource(tenantId: string): Promise<DataSource> {
		if (this.dataSources.has(tenantId)) {
			return this.dataSources.get(tenantId)
		}
		const tenant = await this.tenancyService.findOneById(tenantId)
		const dataSource = new DataSource({
			...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
			host: tenant.host,
			entities: [RFIDReaderEntity, RFIDMatchCustomerEntity]
		})
		if (!dataSource.isInitialized) {
			await dataSource.initialize()
		}
		this.dataSources.set(tenantId, dataSource)
		return dataSource
	}
}
