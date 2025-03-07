import { FileLogger } from '@/common/helpers/file-logger.helper'
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Job, Queue } from 'bullmq'
import { readFileSync } from 'fs-extra'
import _ from 'lodash'
import { AnyBulkWriteOperation, PaginateModel } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { Tenant } from '../tenancy/constants'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import { EXCLUDED_EPC_PATTERN, EXCLUDED_ORDERS, FALLBACK_VALUE, POST_DATA_QUEUE } from './constants'
import { PostReaderDataDTO } from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { Epc, EpcDocument, EpcSchema } from './schemas/epc.schema'
import { StoredRFIDReaderItem } from './types'

@Processor(POST_DATA_QUEUE)
export class RFIDConsumer extends WorkerHost {
	private readonly epcInformationQuery: string = readFileSync(
		resolve(join(__dirname, './sql/epc-information.sql')),
		'utf-8'
	)

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
			const epcList = data.tagList.map((item) => item.epc.trim()).join(',')
			const excludedOrderList = EXCLUDED_ORDERS.join(',')
			const stationNO = deviceInformation?.station_no ?? FALLBACK_VALUE
			const incommingEpcs = await dataSource.query<StoredRFIDReaderItem[]>(this.epcInformationQuery, [
				FALLBACK_VALUE,
				epcList,
				EXCLUDED_EPC_PATTERN,
				excludedOrderList
			])

			if (incommingEpcs.length === 0) return

			// * Check if EPC have no information, trigger queue to fetch from third party API
			const validUnknownEpcs = incommingEpcs.filter(
				(item) => item.mo_no === FALLBACK_VALUE && !item.epc.startsWith('E28')
			)
			if (validUnknownEpcs.length > 0) {
				const uniqueEpcs = _.uniqBy(validUnknownEpcs, (item) => item.epc.substring(0, 22)).map((item) => item.epc)
				this.thirdPartyApiSyncQueue.add(tenantId, uniqueEpcs, {
					jobId: deviceInformation.factory_code,
					attempts: 3,
					backoff: { type: 'exponential' }
				})
			}

			const bulkOperations: AnyBulkWriteOperation<typeof EpcSchema>[] = incommingEpcs.map((item) => ({
				updateOne: {
					filter: { epc: item.epc },
					update: { ...item, station_no: stationNO, record_time: new Date() },
					upsert: true
				}
			}))
			await this.epcModel.bulkWrite(bulkOperations, {
				writeConcern: { w: 'majority' },
				ordered: false,
				retryWrites: true,
				timestamps: true
			})
		} catch (e) {
			FileLogger.error(e)
		}
	}

	@OnWorkerEvent('completed')
	onWorkerCompleted(job: Job) {
		FileLogger.info(`Job "${job.name}" completed`)
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
