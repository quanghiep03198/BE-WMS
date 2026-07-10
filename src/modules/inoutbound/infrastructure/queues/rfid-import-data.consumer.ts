import { StorageFile } from '@blazity/nest-file-fastify'
import { VALID_EPC_PATTERN } from '@common/constants/regex'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import csvParser from 'csv-parser'
import { AnyBulkWriteOperation } from 'mongoose'
import { Readable } from 'node:stream'
import { DataSource } from 'typeorm'
import { EXCLUDED_ORDERS } from '../../domain/constants'
import { IMPORT_DATA_QUEUE } from '../constants/queue'
import { EpcInbound, EpcModel, EpcSchema } from '../persistence/mongodb/schemas/inventory-epc.schema'
import epcInformationQuery from '../persistence/mssql/sql/epc-information.sql'
import { StoredRFIDReaderItem } from '../types'

@Processor(IMPORT_DATA_QUEUE)
export class RFIDImportDataConsumer extends WorkerHost {
	private readonly epcInformationQuery: string = epcInformationQuery

	constructor(
		@InjectModel(EpcInbound.name, DATA_WAREHOUSE_CONNECTION) private readonly inboundEpcModel: EpcModel,
		@InjectModel(EpcInbound.name, DATA_WAREHOUSE_CONNECTION) private readonly outboundEpcModel: EpcModel,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource
	) {
		super()
	}

	async process(job: Job<Array<StorageFile & { buffer: any }>>) {
		/**
		 * @description Dansko's EPC prefix to exclude from the import
		 */

		const station = job.id
		const files = job.data
		const results: Set<string> = new Set()

		for (const file of files) {
			await new Promise<void>((resolve, reject) => {
				Readable.from(Buffer.from(file?.buffer))
					.pipe(
						csvParser({
							headers: [
								'ant',
								'direction',
								'epc',
								'firstAnt',
								'firstTime',
								'humString',
								'lastTime',
								'rssi',
								'tempString',
								'tid',
								'victoryAnt'
							]
						})
					)
					.on('data', (data: { epc?: string }) => {
						if (typeof data.epc === 'string' && VALID_EPC_PATTERN.test(data.epc) && !results.has(data.epc)) {
							results.add(data.epc.trim())
						}
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

		const bulkWriteOptions = incommingEpcs.map((item) => {
			const options: AnyBulkWriteOperation<EpcSchema> = {
				updateOne: {
					filter: { epc: item.epc, scannable: true },
					update: { ...item, station_no: station },
					upsert: true
				}
			}
			if (station.endsWith('103')) {
				options.updateOne.filter['po'] = null
				options.updateOne.update['deleted'] = false
				return options
			}
			return options
		})

		const $model = station.endsWith('101') ? this.inboundEpcModel : this.outboundEpcModel

		await $model.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
