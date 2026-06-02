import { VALID_EPC_PATTERN } from '@/common/constants/regex'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { throttle } from 'lodash'
import { AnyBulkWriteOperation, FilterQuery, mongo, UpdateWriteOpResult } from 'mongoose'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { EXCLUDED_EPC_PREFIX, EXCLUDED_ORDERS, FALLBACK_VALUE } from '../constants'
import { FindEpcBySizeDTO, PostReaderDataDTO, RestoreArchivedEpcsDTO } from '../dto/rfid-shared.dto'
import { EpcDocument, EpcInbound, EpcModel, EpcOutbound, EpcSchema } from '../schemas/epc.schema'
import { RFIDSearchParams, ScannedOrderDetail, StoredRFIDReaderItem } from '../types'
import { RFIDDeviceService } from './rfid-device.service'

@Injectable()
export class RFIDSharedService {
	private readonly epcInformationQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/epc-information.sql')),
		'utf-8'
	)
	private readonly deduplicatedEpcInformationQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/deduplicated-epc-information.sql')),
		'utf-8'
	)

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel,
		private readonly rfidDeviceService: RFIDDeviceService
	) {}

	public async cleanupQueue($queue: Queue): Promise<unknown[]> {
		const GRACE_PERIOD = 60 * 1000 * 5
		const QUANTITY = 1000
		return await Promise.all([
			$queue.drain(),
			$queue.clean(GRACE_PERIOD, QUANTITY, 'active'),
			$queue.clean(GRACE_PERIOD, QUANTITY, 'paused'),
			$queue.clean(GRACE_PERIOD, QUANTITY, 'failed'),
			$queue.clean(GRACE_PERIOD, QUANTITY, 'completed')
		])
	}

	public async fetchLatestData($model: EpcModel, factory: string, args: RFIDSearchParams) {
		const [epcs, orders, has_invalid] = await Promise.all([
			this.getIncomingEpc($model, factory, args),
			this.getOrderDetail($model, factory, args['device_sn.eq']),
			this.checkInvalidEpcExist($model, factory)
		])

		return { epcs, orders, has_invalid }
	}

	public async getIncomingEpc($model: EpcModel, factory: string, args: RFIDSearchParams) {
		const filterQuery: FilterQuery<EpcDocument> = {
			scannable: true,
			station_no: { $regex: new RegExp(factory, 'i') },
			mo_no: args['mo_no.eq'],
			device_sn: args['device_sn.eq']
		}
		if (!args['mo_no.eq']) delete filterQuery.mo_no

		return await $model.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
			select: ['epc', 'mo_no'],
			lean: true,
			page: args.page,
			limit: args.limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' },
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1
			}
		})
	}

	private async checkInvalidEpcExist($model: EpcModel, factory: string): Promise<boolean> {
		const hasInvalidEpc = await $model
			.exists({
				scannable: true,
				epc: { $regex: /^E28/i },
				station_no: { $regex: new RegExp(factory, 'i') }
			})
			.lean(true)

		return Boolean(hasInvalidEpc)
	}

	public async getOrderDetail($model: EpcModel, factory: string, device_sn: string) {
		return await $model.aggregate<ScannedOrderDetail>(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						$or: [{ deleted: false }, { deleted: null }],
						scannable: true,
						station_no: { $regex: new RegExp(factory, 'i') },
						device_sn
					}
				},
				// * Stage 2: Group by mo_no, color_sn, and factory_shoes_style, and aggregate sizes
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							color_sn: '$color_sn',
							factory_shoes_style: '$factory_shoes_style',
							factory_code_produce: '$factory_code_produce',
							size_numcode: '$size_numcode'
						},
						count: { $sum: 1 }
					}
				},
				// * Stage 3: Reshape the data to group sizes into an array
				{
					$group: {
						_id: {
							mo_no: '$_id.mo_no',
							color_sn: '$_id.color_sn',
							factory_shoes_style: '$_id.factory_shoes_style',
							factory_code_produce: '$_id.factory_code_produce'
						},
						sizes: {
							$push: {
								size_numcode: '$_id.size_numcode',
								count: '$count'
							}
						}
					}
				},
				// * Stage 4: Reshape the final output
				{
					$project: {
						_id: 0,
						mo_no: '$_id.mo_no',
						color_sn: '$_id.color_sn',
						factory_shoes_style: '$_id.factory_shoes_style',
						factory_code_produce: '$_id.factory_code_produce',
						sizes: 1
					}
				},
				// * Stage 5: Sort the results
				{ $sort: { mo_no: 1, color_sn: 1, factory_shoes_style: 1 } }
			],
			{ readPreference: 'nearest' }
		)
	}

	public async findDeletableEpcs($model: EpcModel, queries: FindEpcBySizeDTO) {
		const VALID_EPC_LENGTH = 24
		return await $model
			.find({
				scannable: true,
				mo_no: queries['mo_no.eq'],
				size_numcode: queries['size_numcode.eq'],
				$expr: { $eq: [{ $strLenCP: '$epc' }, VALID_EPC_LENGTH] }
			})
			.select('epc')
			.lean()
	}

	/**
	 *
	 * @param $model
	 * @param onSnapshot
	 * @returns {mongodb.ChangeStream<ResultType, ChangeType>}
	 */
	public captureDataChange($model: EpcModel, onSnapshot: (change?: any) => unknown): ReturnType<typeof $model.watch> {
		const changeStream = $model.watch(
			[
				{
					$match: {
						operationType: {
							$in: ['insert', 'update', 'delete']
						}
					}
				}
			],
			{
				fullDocument: 'updateLookup',
				readPreference: 'nearest'
			}
		)

		changeStream.on('change', throttle(onSnapshot, 500, { leading: true, trailing: true }))

		return changeStream
	}

	public async bulkWriteRFIDData($model: EpcModel, station: 'WH101' | 'WH103', { data, sn }: PostReaderDataDTO) {
		// * Get the RFID reader information from the database
		const deviceInformation = await this.rfidDeviceService.findOneBySeriesNumber(sn, station)

		const stationNO = deviceInformation?.station_no ?? FALLBACK_VALUE
		const epcList = data.tagList
			.map((item) => item.epc.trim().toUpperCase())
			.filter((item) => !item.startsWith(EXCLUDED_EPC_PREFIX))
			.join(',')

		const excludedOrderList = EXCLUDED_ORDERS.join(',')
		/**
		 * * Get the EPCs information from the database with received data
		 * * Do not receive EPCs that start with '303429' (Dansko's EPCs)
		 */
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')

		const epcInfoQuery =
			isDeduplicationEnabled && station === 'WH101' ? this.deduplicatedEpcInformationQuery : this.epcInformationQuery

		const scannedEpcs = await this.dataSourceDL.query<StoredRFIDReaderItem[]>(epcInfoQuery, [
			epcList,
			excludedOrderList
		])

		if (scannedEpcs.length === 0) return

		const bulkWriteOptions: AnyBulkWriteOperation<EpcSchema>[] = scannedEpcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc, scannable: true },
				update: { ...item, device_sn: sn, station_no: stationNO, record_time: new Date(), deleted: false },
				upsert: true
			}
		}))
		await $model.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}

	public async deleteScannedOrder(
		$model: EpcModel,
		commandNumber: string,
		rescannable: boolean
	): Promise<UpdateWriteOpResult> {
		return await $model.updateMany({ mo_no: commandNumber }, { deleted: true, scannable: rescannable }).exec()
	}

	public async deleteBulkEpcs($model: EpcModel, epcs: string[], rescannable: boolean): Promise<UpdateWriteOpResult> {
		return await $model.updateMany({ epc: { $in: epcs } }, { deleted: true, scannable: rescannable }).exec()
	}

	public async getArchivedEpcFeatures() {
		return await this.epcInboundModel
			.aggregateWithDeleted([
				{
					$match: {
						epc: { $regex: VALID_EPC_PATTERN },
						mo_no: { $ne: FALLBACK_VALUE },
						size_numcode: { $ne: FALLBACK_VALUE },
						factory_shoes_style: { $ne: FALLBACK_VALUE },
						color_sn: { $ne: FALLBACK_VALUE }
					}
				},
				{
					$group: {
						_id: {
							factory_shoes_style: '$factory_shoes_style',
							color_sn: '$color_sn',
							mo_no: '$mo_no',
							size_numcode: '$size_numcode'
						}
					}
				},
				{
					$group: {
						_id: {
							factory_shoes_style: '$_id.factory_shoes_style',
							color_sn: '$_id.color_sn',
							mo_no: '$_id.mo_no'
						},
						sizes: {
							$push: '$_id.size_numcode'
						}
					}
				},
				{
					$group: {
						_id: {
							factory_shoes_style: '$_id.factory_shoes_style',
							color_sn: '$_id.color_sn'
						},
						batches: {
							$push: {
								mo_no: '$_id.mo_no',
								sizes: '$sizes'
							}
						}
					}
				},
				{
					$group: {
						_id: '$_id.factory_shoes_style',
						colorways: {
							$push: {
								color_sn: '$_id.color_sn',
								batches: '$batches'
							}
						}
					}
				},
				{
					$project: {
						_id: 0,
						factory_shoes_style: '$_id',
						colorways: '$colorways'
					}
				}
			])
			.exec()
	}

	public async restoreArchivedEpcs(
		type: 'inbound' | 'outbound',
		epcs: RestoreArchivedEpcsDTO
	): Promise<mongo.BulkWriteResult> {
		const $model = type === 'inbound' ? this.epcInboundModel : this.epcOutboundModel

		const bulkWriteOptions: AnyBulkWriteOperation<EpcSchema>[] = epcs.map((item) => ({
			updateOne: {
				filter: {
					epc: item.epc
					// ? Temporarily exclude deleted items
					// stored_at: null
				},
				update: {
					...item,
					deleted: false,
					scannable: true,
					stored_at: null,
					...(type === 'outbound' && { po: null })
				},
				upsert: true
			}
		}))
		return await $model.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			readPreference: 'nearest',
			ordered: false,
			retryWrites: true
		})
	}
}
