import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { AnyBulkWriteOperation, FilterQuery } from 'mongoose'
import { DataSource } from 'typeorm'

import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import { ScannedOrderDetail, UploadAction } from '@/modules/inoutbound/domain/types'
import { RFIDSearchParams } from '../../../types'
import { InventoryEpc, InventoryEpcDocument, InventoryEpcModel } from '../schemas/inventory-epc.schema'

@Injectable()
export class InventoryEpcRepository {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {}

	public async getScanningEPCs(params: RFIDSearchParams): Promise<Pagination<Record<'epc' | 'mo_no', string>>> {
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

	public async getScanningMOs(
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

	public async getInternalEPCExist(
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

	public async bulkWriteInventoryEPCs({
		action,
		payload
	}: {
		action: UploadAction
		payload: { eProductCodes: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void> {
		console.log('[bulkWriteInventoryEPCs] action :>>', action)

		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
		const bulkWriteOptions: AnyBulkWriteOperation<InventoryEpcDocument>[] = payload.eProductCodes.map((item) => {
			const operation: AnyBulkWriteOperation<InventoryEpcDocument> = {
				updateOne: {
					filter: { epc: item.getProductCode(), scannable: true },
					update: {
						epc: item.getProductCode(),
						mo_no: item.getCommandNumber(),
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

		await this.inventoryEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
