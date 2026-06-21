import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import { IInoutboundMongoRepository } from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import { InventoryAction, ScannedOrderDetail } from '@/modules/inoutbound/domain/types'
import { RestoreArchivedEpcsDTO } from '@/modules/inoutbound/presentation/dto/rfid-shared.dto'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { AnyBulkWriteOperation, FilterQuery } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RFIDSearchParams } from '../../../types'
import { InventoryEpc, InventoryEpcDocument, InventoryEpcModel } from '../schemas/inventory-epc.schema'

@Injectable()
export class InoutboundMongoRepository implements IInoutboundMongoRepository {
	constructor(
		@InjectPinoLogger(InoutboundMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {}

	public async getAllScanningEpcsByOrder(
		deviceSerialNumber: string,
		manufacturingOrder: string
	): Promise<ElectronicProductCode[]> {
		const rawData = await this.inventoryEpcModel
			.find({ scannable: true, inbound_device_sn: deviceSerialNumber, mo_no: manufacturingOrder })
			.lean()
		return rawData
			.map(
				(item) =>
					new ElectronicProductCode(
						item.epc,
						item.scannable,
						item.mo_no,
						item.factory_shoes_style,
						item.color_sn,
						item.size_numcode,
						item.factory_code_produce
					)
			)
			.filter((item) => item.getIsWritable())
	}

	public async getPaginatedScanningEpcs(
		params: RFIDSearchParams
	): Promise<Pagination<Record<'epc' | 'mo_no', string>>> {
		const manufacturingOrder = params['mo_no.eq']
		const inboundDeviceSerialNumber = params['inbound_device_sn.eq']
		const outboundDeviceSerialNumber = params['outbound_device_sn.eq']

		const filterQuery: FilterQuery<InventoryEpcDocument> = {
			scannable: true,
			deleted: { $ne: true },
			...(manufacturingOrder && {
				mo_no: manufacturingOrder
			}),
			...(inboundDeviceSerialNumber && {
				inbound_device_sn: inboundDeviceSerialNumber,
				inbound_at: null
			}),
			...(outboundDeviceSerialNumber && {
				outbound_device_sn: outboundDeviceSerialNumber,
				outbound_at: null,
				po: null
			})
		}

		const paginateResult = await this.inventoryEpcModel.paginate(filterQuery, {
			sort: { last_scanned_at: -1, epc: 1, mo_no: 1 },
			select: ['epc', 'mo_no'],
			lean: true,
			page: params.page,
			limit: params.limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' },
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1
			}
		})

		return {
			data: paginateResult.data as Record<'epc' | 'mo_no', string>[],
			page: paginateResult.page,
			limit: paginateResult.limit,
			hasNextPage: paginateResult.hasNextPage,
			hasPrevPage: paginateResult.hasPrevPage,
			nextPage: paginateResult.nextPage,
			prevPage: paginateResult.prevPage,
			totalDocs: paginateResult.totalDocs,
			totalPages: paginateResult.totalPages
		}
	}

	public async getScanningManufacturingOrders(
		params:
			| Required<Pick<RFIDSearchParams, 'inbound_device_sn.eq'>>
			| Required<Pick<RFIDSearchParams, 'outbound_device_sn.eq'>>
	): Promise<ScannedOrderDetail[]> {
		return await this.inventoryEpcModel.aggregate<ScannedOrderDetail>(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						scannable: true,
						...(params['inbound_device_sn.eq'] && {
							inbound_device_sn: params['inbound_device_sn.eq'],
							inbound_at: null,
							outbound_at: null,
							po: null
						}),
						...(params['outbound_device_sn.eq'] && {
							outbound_device_sn: params['outbound_device_sn.eq'],
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

	public async getInternalEpcExist(
		params:
			| Required<Pick<RFIDSearchParams, 'inbound_device_sn.eq'>>
			| Required<Pick<RFIDSearchParams, 'outbound_device_sn.eq'>>
	): Promise<boolean> {
		const existedRecord = await this.inventoryEpcModel
			.exists({
				scannable: true,
				epc: { $regex: /^E28/i },
				...(params['inbound_device_sn.eq'] && { inbound_device_sn: params['inbound_device_sn.eq'] }),
				...(params['outbound_device_sn.eq'] && { outbound_device_sn: params['outbound_device_sn.eq'] })
			})
			.lean(true)

		return Boolean(existedRecord)
	}

	public async bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: InventoryAction
		payload: { eProductCodes: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<number> {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
		const bulkWriteOptions: AnyBulkWriteOperation<InventoryEpcDocument>[] = payload.eProductCodes.map((item) => {
			const operation: AnyBulkWriteOperation<InventoryEpcDocument> = {
				updateOne: {
					filter: { epc: item.getStockKeepingUnit(), scannable: true },
					update: {
						epc: item.getStockKeepingUnit(),
						mo_no: item.getManufacturingOrder(),
						factory_shoes_style: item.getShoeStyle(),
						color_sn: item.getColor(),
						size_numcode: item.getSize(),
						last_scanned_at: new Date(),
						factory_code_produce: item.getFactoryProduce(),
						...(action === 'inbound' && {
							inbound_device_sn: payload.deviceSerialNumber
						}),
						...(action === 'inbound' &&
							!isDeduplicationEnabled && {
								deleted: false,
								inbound_at: null
							}),
						...(action === 'outbound' && {
							inbound_device_sn: payload.deviceSerialNumber,
							outbound_at: null
						})
					},
					upsert: true,
					...(action === 'inbound' && isDeduplicationEnabled && { overwriteImmutable: true })
				}
			}

			return operation
		})

		const result = await this.inventoryEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		return result.upsertedCount
	}

	public async updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<number> {
		const result = await this.inventoryEpcModel
			.updateMany(
				{ epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }, inbound_at: null },
				{ inbound_at: new Date() }
			)
			.exec()

		this.logger.debug(result)

		return result.modifiedCount
	}

	public async deleteScannedOrder(
		action: InventoryAction,
		manufacturingOrder: string,
		deviceSerialNumber: string,
		rescannable: boolean
	): Promise<number> {
		const result = await this.inventoryEpcModel
			.updateMany(
				{
					mo_no: manufacturingOrder,
					...(action === 'inbound' && { inbound_at: null, inbound_device_sn: deviceSerialNumber }),
					...(action === 'outbound' && { outbound_at: null, outbound_device_sn: deviceSerialNumber })
				},
				{ deleted: true, scannable: rescannable },
				{ overwriteImmutable: true }
			)
			.exec()

		return result.matchedCount
	}

	public async bulkDeleteEpcs(
		inventoryAction: InventoryAction,
		epcs: string[],
		rescannable: boolean
	): Promise<number> {
		const result = await this.inventoryEpcModel
			.updateMany(
				{
					epc: { $in: epcs },
					...(inventoryAction === 'inbound' && { inbound_at: null }),
					...(inventoryAction === 'outbound' && { outbound_at: null, po: null })
				},
				{ deleted: true, scannable: rescannable }
			)
			.exec()

		return result.matchedCount
	}

	public async restoreArchivedEpcs(action: InventoryAction, epcs: RestoreArchivedEpcsDTO): Promise<number> {
		const bulkWriteOptions: AnyBulkWriteOperation<InventoryEpcDocument>[] = epcs.map((item) => ({
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
					...(action === 'inbound' && { inbound_at: null }),
					...(action === 'outbound' && { outbound_at: null, po: null })
				},
				upsert: true
			}
		}))

		const result = await this.inventoryEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			readPreference: 'nearest',
			ordered: false,
			retryWrites: true
		})

		return result.matchedCount
	}
}
