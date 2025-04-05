import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import { readFileSync } from 'fs-extra'
import { AnyBulkWriteOperation, PaginateModel } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { EXCLUDED_EPC_PATTERN, EXCLUDED_ORDERS, FALLBACK_VALUE, POST_DATA_QUEUE } from '../constants'
import { PostReaderDataDTO } from '../dto/rfid.dto'
import { RFIDReaderEntity } from '../entities/rfid-reader.entity'
import { EpcDocument, EpcInbound, EpcInboundSchema } from '../schemas/epc.schema'
import { StoredRFIDReaderItem } from '../types'

@Processor(POST_DATA_QUEUE)
export class RFIDInboundConsumer extends WorkerHost {
	private readonly epcInformationQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/epc-information.sql')),
		'utf-8'
	)

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource,
		@InjectModel(EpcInbound.name) private readonly epcModel: PaginateModel<EpcDocument>
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
			// const tenantId = job.name
			const { data, sn } = job.data

			// * Get the RFID reader information from the database
			const deviceInformation = await this.dataSource.getRepository(RFIDReaderEntity).findOneBy({ device_sn: sn })

			/**
			 * * Get the EPCs information from the database with received data
			 * * Do not receive EPCs that start with '303429' (Dansko's EPCs)
			 */
			const epcList = data.tagList.map((item) => item.epc.trim()).join(',')
			const excludedOrderList = EXCLUDED_ORDERS.join(',')
			const stationNO = deviceInformation?.station_no ?? FALLBACK_VALUE
			const incommingEpcs = await this.dataSource.query<StoredRFIDReaderItem[]>(this.epcInformationQuery, [
				FALLBACK_VALUE,
				epcList,
				EXCLUDED_EPC_PATTERN,
				excludedOrderList
			])

			if (incommingEpcs.length === 0) return

			const bulkOperations: AnyBulkWriteOperation<typeof EpcInboundSchema>[] = incommingEpcs.map((item) => ({
				updateOne: {
					filter: { epc: item.epc, scannable: true },
					update: { ...item, station_no: stationNO, record_time: new Date(), deleted: false },
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
}
