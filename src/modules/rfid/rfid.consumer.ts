import { FileLogger } from '@/common/helpers/file-logger.helper'
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Job, Queue } from 'bullmq'
import _ from 'lodash'
import { AnyBulkWriteOperation, PaginateModel } from 'mongoose'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { Tenant } from '../tenancy/constants'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import {
	EXCLUDED_ORDERS,
	FALLBACK_VALUE,
	POST_DATA_QUEUE_GL1,
	POST_DATA_QUEUE_GL3,
	POST_DATA_QUEUE_GL4
} from './constants'
import { PostReaderDataDTO } from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { Epc, EpcDocument } from './schemas/epc.schema'
import { StoredRFIDReaderItem } from './types'

class BaseRFIDConsumer extends WorkerHost {
	private readonly logger = new Logger(BaseRFIDConsumer.name)
	private readonly dataSources: Map<string, DataSource> = new Map()
	private readonly tenants = [
		{
			id: Tenant.DEV,
			host: this.configService.get('TENANT_DEV')
		},
		{
			id: Tenant.VN_LIANYING_PRIMARY,
			host: this.configService.get('TENANT_VN_LIANYING_PRIMARY')
		},
		{
			id: Tenant.VN_LIANSHUN_PRIMARY,
			host: this.configService.get('TENANT_VN_LIANSHUN_PRIMARY')
		},
		{
			id: Tenant.KM_PRIMARY,
			host: this.configService.get('TENANT_KM_PRIMARY')
		}
	]

	constructor(
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
		private readonly configService: ConfigService
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

			/**
			 * * Get the EPCs information from the database with received data
			 * * Do not receive EPCs that start with '303429' (Dansko's EPCs)
			 */
			const epcList = data.tagList
				.filter((item) => !item.epc.startsWith('303429'))
				.map((item) => item.epc.trim())
				.join(',')
			const excludedOrderList = EXCLUDED_ORDERS.join(',')
			const stationNO = deviceInformation?.station_no ?? FALLBACK_VALUE
			const incommingEpcs = await dataSource.query<StoredRFIDReaderItem[]>(
				/* SQL */ `
				SELECT DISTINCT a.EPC_Code AS epc, 
					COALESCE(b.mo_no_actual, b.mo_no, @0) AS mo_no,
					COALESCE(b.mat_code, @0) AS mat_code,
					COALESCE(b.shoestyle_codefactory, @0) AS shoes_style_code_factory,
					COALESCE(b.size_numcode, @0) AS size_numcode
				FROM (
					SELECT value AS EPC_Code FROM STRING_SPLIT(@1, ',')
				) AS a
				LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust b ON a.EPC_Code = b.EPC_Code
				WHERE 
					b.mo_no IS NULL 
					OR b.mo_no NOT IN (
						SELECT value AS mo_no FROM STRING_SPLIT(@2, ',')
					)
				`,
				[FALLBACK_VALUE, epcList, excludedOrderList]
			)

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

			const bulkOperations: AnyBulkWriteOperation<any>[] = incommingEpcs.map((item) => ({
				updateOne: {
					filter: { epc: item.epc },
					update: { ...item, station_no: stationNO, tenant_id: tenantId },
					upsert: true
				}
			}))
			await this.epcModel.bulkWrite(bulkOperations)
		} catch (e) {
			this.logger.error(e)
			FileLogger.error(e)
		}
	}

	@OnWorkerEvent('completed')
	onWorkerCompleted(job: Job) {
		this.logger.log(`Job "${job.name}" completed`)
	}

	@OnWorkerEvent('failed')
	onWorkerFailed(job: Job) {
		FileLogger.error(`Job "${job.name}" failed: ${job.failedReason}`)
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
		const tenant = this.tenants.find((tenant) => tenant.id === tenantId)

		const dataSource = new DataSource({
			...this.configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
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

@Processor(POST_DATA_QUEUE_GL1)
export class GL1RFIDConsumer extends BaseRFIDConsumer {}

@Processor(POST_DATA_QUEUE_GL3)
export class GL3RFIDConsumer extends BaseRFIDConsumer {}

@Processor(POST_DATA_QUEUE_GL4)
export class GL4RFIDConsumer extends BaseRFIDConsumer {}
