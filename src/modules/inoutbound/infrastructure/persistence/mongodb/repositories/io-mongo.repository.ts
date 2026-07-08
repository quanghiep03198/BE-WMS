import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import { IIoMongoRepository } from '@/modules/inoutbound/application/ports/io-mongo.repository.port'
import { GetScanningEpcsBySizeQuery } from '@/modules/inoutbound/application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { StockMovementDirection } from '@/modules/inoutbound/domain/types'
import { ElectronicProductCode } from '@/modules/inoutbound/domain/value-objects/epc.vo'
import { SizeNumber } from '@/modules/inoutbound/domain/value-objects/size-number.vo'
import { RestoreArchivedEpcsDTO } from '@/modules/inoutbound/presentation/dto/rfid-shared.dto'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { AnyBulkWriteOperation, FilterQuery, MongooseError } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { InventoryEpc, InventoryEpcDocument, InventoryEpcModel } from '../schemas/inventory-epc.schema'

@Injectable()
export class InoutboundMongoRepository implements IIoMongoRepository {
	constructor(
		@InjectPinoLogger(InoutboundMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	public async getPendingInboundEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string
	): Promise<ElectronicProductCode[]> {
		const rawData = await this.inventoryEpcModel
			.find({ scannable: true, inbound_device_sn: deviceSerialNumber, mo_no: manufacturingOrder })
			.lean()
		return rawData
			.map(
				(item) =>
					new ElectronicProductCode(item.epc, {
						scannable: item.scannable,
						mo_no: item.mo_no,
						factory_shoes_style: item.factory_shoes_style,
						color_sn: item.color_sn,
						size_numcode: new SizeNumber(item.size_numcode),
						factory_code_produce: item.factory_code_produce,
						po: item.po
					})
			)
			.filter((item) => item.getIsWritable())
	}

	public async getPendingExchangeEpcs(query: {
		deviceSerialNumber: string
		manufacturingOrder: string
		sizeNumber: string
		quantity: number
	}): Promise<
		Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	> {
		return await this.inventoryEpcModel.find(
			{
				mo_no: query.manufacturingOrder,
				size_numcode: query.sizeNumber,
				inbound_device_sn: query.deviceSerialNumber,
				deleted: false,
				scannable: true
			},
			{ _id: 0, epc: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
			{ limit: query.quantity, lean: true }
		)
	}

	public async getPendingExchangeMos(
		deviceSerialNumber: string,
		sourceMos: string[]
	): Promise<
		Array<{
			epcs: Array<string>
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			sizes: Array<string>
		}>
	> {
		const epcs = await this.inventoryEpcModel
			.find(
				{
					inbound_device_sn: deviceSerialNumber,
					mo_no: { $in: sourceMos },
					scannable: true
				},
				{ epc: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1, _id: 0 }
			)
			.lean()

		const result = Object.entries(
			Object.groupBy(epcs, (item) => `${item.mo_no}/${item.factory_shoes_style}/${item.color_sn}`)
		).map(([aggregateAttributes, value]) => {
			const [mo_no, factory_shoes_style, color_sn] = aggregateAttributes.split('/')
			return {
				epcs: [...new Set(value.map((item) => item.epc))],
				mo_no,
				factory_shoes_style,
				color_sn,
				sizes: [...new Set(value.map((item) => item.size_numcode))].map((size_numcode) => size_numcode)
			}
		})

		return result
	}

	/**
	 * @deprecated
	 * @param params
	 * @returns
	 */
	public async getScanningEpcs(params: {
		mo_no: string
		color_sn: string
		factory_shoes_style: string
		inbound_device_sn: string
	}): Promise<string[]> {
		return await this.inventoryEpcModel.distinct(
			'epc',
			{
				deleted: false,
				scannable: true,
				mo_no: { $in: params.mo_no.split(',').map((m) => m.trim()) },
				color_sn: params.color_sn,
				factory_shoes_style: params.factory_shoes_style,
				inbound_device_sn: params.inbound_device_sn
			},
			{ lean: true }
		)
	}

	public async getScanningEpcsBySize(query: GetScanningEpcsBySizeQuery): Promise<Array<{ epc: string }>> {
		const filterQuery: FilterQuery<InventoryEpcDocument> = {
			scannable: true,
			mo_no: query.manufacturingOrder,
			size_numcode: query.sizeNumber
		}

		if (query.stockMovementDirection === 'inbound' && query.inboundDeviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: query.inboundDeviceSerialNumber }
			filterQuery.inbound_at = { $eq: null }
		}

		if (query.stockMovementDirection === 'outbound') {
			filterQuery.outbound_at = { $eq: null }
			filterQuery.po = { $eq: null }
		}

		return await this.inventoryEpcModel.find(filterQuery, { _id: 0, epc: 1 }, { lean: true, limit: query.limit })
	}

	public async bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockMovementDirection
		payload: { epcs: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void> {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
		const bulkWriteOptions: AnyBulkWriteOperation<InventoryEpcDocument>[] = payload.epcs.map((item) => {
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
							po: null,
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

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<void> {
		await this.inventoryEpcModel
			.updateMany(
				{ epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }, inbound_at: null },
				{ inbound_at: new Date() }
			)
			.session(this.txHost.tx)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async exchangeMo(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void> {
		await this.inventoryEpcModel
			.updateMany({ epc: { $in: pendingExchangeEpcs } }, { mo_no: targetMo })
			.session(this.txHost.tx)
		throw new MongooseError('Some error occurred while executing the command')
	}

	public async restoreArchivedEpcs(action: StockMovementDirection, epcs: RestoreArchivedEpcsDTO): Promise<void> {
		const bulkWriteOptions: AnyBulkWriteOperation<InventoryEpcDocument>[] = epcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc },
				update: {
					deleted: false,
					scannable: true,
					stored_at: null,
					...item,
					...(action === 'inbound' && { inbound_at: null }),
					...(action === 'outbound' && { outbound_at: null, po: null })
				},
				upsert: true
			}
		}))

		await this.inventoryEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			readPreference: 'nearest',
			ordered: false,
			retryWrites: true
		})
	}
}
