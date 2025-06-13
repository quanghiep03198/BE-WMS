import { EXCLUDED_EPC_REGEX } from '@/common/constants/regex'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import csvParser from 'csv-parser'
import { AnyBulkWriteOperation } from 'mongoose'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { DataSource } from 'typeorm'
import { EXCLUDED_ORDERS, IMPORT_DATA_QUEUE } from '../constants'
import { EpcInbound, EpcModel, EpcOutbound, EpcSchema } from '../schemas/epc.schema'
import { StoredRFIDReaderItem } from '../types'

@Processor(IMPORT_DATA_QUEUE)
export class RFIDImportDataConsumer extends WorkerHost {
	private readonly epcInformationQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/epc-information.sql')),
		'utf-8'
	)

	constructor(
		@InjectModel(EpcInbound.name) private readonly inboundEpcModel: EpcModel,
		@InjectModel(EpcOutbound.name) private readonly outboundEpcModel: EpcModel,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource
	) {
		super()
	}

	async process(job: Job<Express.Multer.File[]>) {
		/**
		 * @description Dansko's EPC prefix to exclude from the import
		 */

		const station = job.id
		const files = job.data
		const results: Set<string> = new Set()

		for (const file of files) {
			await new Promise<void>((resolve, reject) => {
				Readable.from(Buffer.from(file.buffer))
					.pipe(csvParser())
					.on('data', (data: { epc: string }) => {
						if (typeof data.epc === 'string' && !EXCLUDED_EPC_REGEX.test(data.epc) && !results.has(data.epc))
							results.add(data.epc.trim())
					})
					.on('end', resolve)
					.on('error', reject)
			})
		}
		const epcList = Array.from(results).join(',')
		const excludedOrderList = EXCLUDED_ORDERS.join(',')

		const incommingEpcs = await this.dataSourceDL.query<StoredRFIDReaderItem[]>(this.epcInformationQuery, [
			epcList,
			excludedOrderList
		])

		if (incommingEpcs.length === 0) return

		const bulkWriteOptions: AnyBulkWriteOperation<EpcSchema>[] = incommingEpcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc, scannable: true },
				update: { ...item, station_no: station },
				upsert: true
			}
		}))

		const $model = station.endsWith('101') ? this.inboundEpcModel : this.outboundEpcModel

		await $model.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
