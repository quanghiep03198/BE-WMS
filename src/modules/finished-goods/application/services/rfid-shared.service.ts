import { VALID_EPC_PATTERN } from '@common/constants/regex'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { throttle } from 'lodash'
import { FilterQuery, UpdateWriteOpResult } from 'mongoose'
import { DataSource } from 'typeorm'
import deduplicatedEpcInformationQuery from '../../infrastructure/persistence/mssql/sql/deduplicated-epc-information.sql'
import epcInformationQuery from '../../infrastructure/persistence/mssql/sql/epc-information.sql'

import { FALLBACK_VALUE } from '../../domain/constants'
import { ScannedOrderDetail } from '../../domain/types'
import {
	EpcDocument,
	EpcInbound,
	EpcModel,
	EpcOutbound,
	FinishedGoodsEpc,
	FinishedGoodsEpcDocument,
	FinishedGoodsEpcModel
} from '../../infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { RFIDSearchParams } from '../../infrastructure/types'
import { FindEpcBySizeDTO } from '../../presentation/dto/rfid-shared.dto'

@Injectable()
export class RFIDSharedService {
	private readonly epcInformationQuery: string = epcInformationQuery
	private readonly deduplicatedEpcInformationQuery: string = deduplicatedEpcInformationQuery

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectModel(EpcInbound.name, DATA_WAREHOUSE_CONNECTION) private readonly epcInboundModel: EpcModel,
		@InjectModel(EpcOutbound.name, DATA_WAREHOUSE_CONNECTION) private readonly epcOutboundModel: EpcModel,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
		// private readonly rfidDeviceService: RFIDDeviceService
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

	public async fetchLatestData(args: RFIDSearchParams) {
		const [epcs, orders, has_invalid] = await Promise.all([
			this.getIncomingEpc(args),
			this.getOrderDetail({}),
			this.checkInvalidEpcExist(args)
		])

		return { epcs, orders, has_invalid }
	}

	public async getIncomingEpc(args: RFIDSearchParams) {
		const filterQuery: FilterQuery<EpcDocument> = {
			scannable: true,
			// station_no: { $regex: new RegExp(factory, 'i') },
			mo_no: args['mo_no:eq'],
			...(args['inbound_device_sn:eq'] && { inbound_device_sn: args['inbound_device_sn:eq'] }),
			...(args['outbound_device_sn:eq'] && { outbound_device_sn: args['outbound_device_sn:eq'] })
		}
		if (!args['mo_no:eq']) delete filterQuery.mo_no

		return await this.finishedGoodsEpcModel.paginate(filterQuery, {
			sort: { last_scanned_at: -1, epc: 1, mo_no: 1 },
			select: ['epc', 'mo_no'],
			lean: true,
			page: args._page,
			limit: args._limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' },
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1
			}
		})
	}

	private async checkInvalidEpcExist(
		args: Pick<RFIDSearchParams, 'inbound_device_sn:eq' | 'outbound_device_sn:eq'>
	): Promise<boolean> {
		const hasInvalidEpc = await this.finishedGoodsEpcModel
			.exists({
				scannable: true,
				epc: { $regex: /^E28/i },
				...(args['inbound_device_sn:eq'] && { inbound_device_sn: args['inbound_device_sn:eq'] }),
				...(args['outbound_device_sn:eq'] && { outbound_device_sn: args['outbound_device_sn:eq'] })
			})
			.lean(true)

		return Boolean(hasInvalidEpc)
	}

	public async getOrderDetail(filter: FilterQuery<FinishedGoodsEpcDocument>) {
		return await this.finishedGoodsEpcModel.aggregate<ScannedOrderDetail>(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						scannable: true,
						...(filter.inbound_device_sn && {
							inbound_device_sn: filter.inbound_device_sn,
							inbound_at: null,
							outbound_at: null,
							po: null
						}),
						...(filter.outbound_device_sn && {
							outbound_device_sn: filter.outbound_device_sn,
							inbound_at: { $ne: null },
							outbound_at: null,
							po: null
						})
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
				mo_no: queries['mo_no:eq'],
				size_numcode: queries['size_numcode:eq'],
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
	public captureDataChange(
		filterQuery:
			| { 'fullDocument.inbound_device_sn': string }
			| { 'fullDocument.outbound_device_sn': string }
			| Record<string, never>,
		onSnapshot: (change?: any) => unknown
	): ReturnType<FinishedGoodsEpcModel['watch']> {
		const changeStream = this.finishedGoodsEpcModel.watch(
			[
				{
					$match: {
						$or: [
							{
								operationType: { $in: ['insert', 'update'] },
								...filterQuery
							},
							{
								operationType: 'delete'
							}
						]
					}
				}
			],
			{
				fullDocument: 'updateLookup',
				readPreference: 'nearest'
			}
		)

		changeStream.on(
			'change',
			throttle(
				(change) => {
					console.log('change :>>>', change)
					onSnapshot(change)
				},
				500,
				{ leading: true, trailing: true }
			)
		)

		return changeStream
	}

	// public async bulkWriteRFIDData($model: EpcModel, station: 'WH101' | 'WH103', { data, sn }: PostReaderDataDTO) {
	// 	// * Get the RFID reader information from the database
	// 	const deviceInformation = await this.rfidDeviceService.findOneBySeriesNumber(sn, station)

	// 	const stationNO = deviceInformation?.station_no ?? FALLBACK_VALUE
	// 	const epcList = data.tagList
	// 		.map((item) => item.epc.trim().toUpperCase())
	// 		.filter((item) => !item.startsWith(EXCLUDED_EPC_PREFIX))
	// 		.join(',')

	// 	const excludedOrderList = EXCLUDED_ORDERS.join(',')
	// 	/**
	// 	 * * Get the EPCs information from the database with received data
	// 	 * * Do not receive EPCs that start with '303429' (Dansko's EPCs)
	// 	 */
	// 	const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')

	// 	const epcInfoQuery =
	// 		isDeduplicationEnabled && station === 'WH101' ? this.deduplicatedEpcInformationQuery : this.epcInformationQuery

	// 	const scannedEpcs = await this.dataSourceDL.query<StoredRFIDReaderItem[]>(epcInfoQuery, [
	// 		epcList,
	// 		excludedOrderList
	// 	])

	// 	if (scannedEpcs.length === 0) return

	// 	const bulkWriteOptions: AnyBulkWriteOperation<EpcSchema>[] = scannedEpcs.map((item) => ({
	// 		updateOne: {
	// 			filter: { epc: item.epc, scannable: true },
	// 			update: { ...item, device_sn: sn, station_no: stationNO, record_time: new Date(), deleted: false },
	// 			upsert: true
	// 		}
	// 	}))
	// 	return await $model.bulkWrite(bulkWriteOptions, {
	// 		writeConcern: { w: 'majority' },
	// 		ordered: false,
	// 		retryWrites: true,
	// 		timestamps: true
	// 	})
	// }

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
		return await this.finishedGoodsEpcModel
			.aggregateDeleted([
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
}
