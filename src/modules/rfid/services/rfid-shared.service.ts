import { DATA_SOURCE_DATA_LAKE, MAIN_DATA_SOURCE, RecordStatus } from '@/databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import { throttle } from 'lodash'
import { AnyBulkWriteOperation, FilterQuery, UpdateWriteOpResult } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { EXCLUDED_EPC_PREFIX, EXCLUDED_ORDERS, FALLBACK_VALUE, InventoryActions } from '../constants'
import { FindEpcBySizeDTO, PostReaderDataDTO } from '../dto/rfid.dto'
import { RFIDReaderEntity } from '../entities/rfid-reader.entity'
import { EpcDocument, EpcModel, EpcSchema } from '../schemas/epc.schema'
import { EpcInformation, RFIDSearchParams, StoredRFIDReaderItem } from '../types'
import { generateStation } from '../utils'

@Injectable()
export class RFIDSharedService {
	private readonly epcInformationQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/epc-information.sql')),
		'utf-8'
	)

	constructor(
		@Inject(MAIN_DATA_SOURCE) private readonly dataSource: DataSource,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource
	) {}

	public async fetchLatestData($model: EpcModel, factory: string, args: RFIDSearchParams) {
		const [epcs, orders, has_invalid] = await Promise.all([
			this.getIncomingEpc($model, factory, args),
			this.getOrderDetail($model, factory),
			this.checkInvalidEpcExist($model, factory)
		])

		return { epcs, orders, has_invalid }
	}

	public async getIncomingEpc($model: EpcModel, factory: string, args: RFIDSearchParams) {
		const filterQuery: FilterQuery<EpcDocument> = {
			scannable: true,
			station_no: { $regex: new RegExp(factory, 'i') },
			mo_no: args['mo_no.eq']
		}
		if (!args['mo_no.eq']) delete filterQuery.mo_no

		return await $model.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
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

	public async getOrderDetail($model: EpcModel, factory: string) {
		return await $model.aggregate(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						$or: [{ deleted: false }, { deleted: null }],
						scannable: true,
						station_no: { $regex: new RegExp(factory, 'i') }
					}
				},
				// * Stage 2: Group by mo_no, color_sn, and shoes_style_code_factory, and aggregate sizes
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							color_sn: '$color_sn',
							shoes_style_code_factory: '$shoes_style_code_factory',
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
							factory_code_produce: '$_id.factory_code_produce',
							shoes_style_code_factory: '$_id.shoes_style_code_factory'
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
						factory_code_produce: '$_id.factory_code_produce',
						shoes_style_code_factory: '$_id.shoes_style_code_factory',
						sizes: 1
					}
				},
				// * Stage 5: Sort the results
				{ $sort: { mo_no: 1, color_sn: 1, shoes_style_code_factory: 1 } }
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

	public async getWarehouseRFIDDevices(factoryCode: string) {
		return await this.dataSource
			.getRepository(RFIDReaderEntity)
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT device_sn`)
			.addSelect(/* SQL */ `device_name`)
			.addSelect(/* SQL */ `ISNULL(STRING_AGG(device_ant, ','), '0') AS device_ant`)
			.addSelect(/* SQL */ `isactive AS is_active`)
			.where(/* SQL */ `device_name LIKE :station_no`, { station_no: `CUS_${factoryCode}_WH10%` })
			.groupBy(/* SQL */ `device_name, device_sn, isactive, CONCAT(ip_address, ':', ip_port)`)
			.getRawMany()
	}

	public async bulkWriteRFIDData($model: EpcModel, $stationCode: 'WH101' | 'WH103', { data, sn }: PostReaderDataDTO) {
		// * Get the RFID reader information from the database
		const deviceInformation = await this.dataSourceDL.getRepository(RFIDReaderEntity).findOne({
			where: { device_sn: sn },
			cache: {
				id: sn,
				milliseconds: 1000 * 60 * 60
			}
		})

		const factory = deviceInformation?.factory_code
		const STATION_PREFIX = 'CUS' as const
		const station = !!factory ? `${STATION_PREFIX}_${factory}_${$stationCode}` : FALLBACK_VALUE
		const epcList = data.tagList
			.map((item) => item.epc.trim().toUpperCase())
			.filter((item) => !item.startsWith(EXCLUDED_EPC_PREFIX))
			.join(',')

		const excludedOrderList = EXCLUDED_ORDERS.join(',')
		/**
		 * * Get the EPCs information from the database with received data
		 * * Do not receive EPCs that start with '303429' (Dansko's EPCs)
		 */
		const scannedEpcs = await this.dataSourceDL.query<StoredRFIDReaderItem[]>(this.epcInformationQuery, [
			epcList,
			excludedOrderList
		])

		if (scannedEpcs.length === 0) return

		const bulkWriteOptions: AnyBulkWriteOperation<EpcSchema>[] = scannedEpcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc, scannable: true },
				update: { ...item, station_no: station.toUpperCase(), record_time: new Date(), deleted: false },
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
		return await $model
			.updateMany({ mo_no: commandNumber }, { deleted: true, scannable: rescannable }, { new: true })
			.exec()
	}

	public async deleteBulkEpcs($model: EpcModel, epcs: string[], rescannable: boolean): Promise<UpdateWriteOpResult> {
		return await $model
			.updateMany({ epc: { $in: epcs } }, { deleted: true, scannable: rescannable }, { new: true })
			.exec()
	}

	public async getArchivedEpcsByOrder(factoryCode: string, commandNumber: string) {
		const subQuery = this.dataSourceDL
			.createQueryBuilder()
			.select('b.EPC_Code', 'EPC_Code')
			.from('dv_InvRFIDrecorddet_backup_Daily', 'b')
			.where('b.rfid_status = :_status')
			.andWhere('b.stationNO = :_station')
			.andWhere('b.mo_no = :commandNumber')
			.setParameters({
				_status: InventoryActions.OUTBOUND,
				_station: generateStation(factoryCode, 'WH103')
			})

		return await this.dataSourceDL
			.createQueryBuilder()
			.distinct()
			.select('a.EPC_Code', 'epc')
			.addSelect('a.mo_no', 'mo_no')
			.addSelect('a.size_code', 'size_numcode')
			.addSelect('c.shoestyle_codefactory', 'shoes_style_code_factory')
			.addSelect('d.color_sn', 'color_sn')
			.from('dv_InvRFIDrecorddet_backup_Daily', 'a')
			.innerJoin(
				'dv_rfidmatchmst_cust',
				'c',
				'a.EPC_Code = c.EPC_Code AND a.mo_no = c.mo_no AND a.size_code = c.size_numcode'
			)
			.innerJoin(
				(qb) => {
					return qb
						.subQuery()
						.select('d.color_sn')
						.addSelect('d.mat_code')
						.from('wuerp_vnrd.dbo.ta_productmst', 'd')
						.where('d.isactive = :record_status')
						.setParameters({ record_status: RecordStatus.ACTIVE })
				},
				'd',
				'c.mat_code = d.mat_code'
			)
			.where('a.rfid_status = :status')
			.andWhere('a.mo_no = :commandNumber')
			.andWhere('a.stationNO = :station')
			.andWhere(`a.EPC_Code NOT IN (${subQuery.getQuery()})`)
			.orderBy('a.size_code', 'ASC')
			.addOrderBy('a.EPC_Code', 'ASC')
			.setParameters({
				commandNumber: commandNumber.toUpperCase(),
				status: InventoryActions.INBOUND,
				station: generateStation(factoryCode, 'WH101'),
				...subQuery.getParameters()
			})
			.getRawMany<EpcInformation>()
	}
}
