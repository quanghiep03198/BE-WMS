import { IIoMongoRepository } from '@/modules/inoutbound/application/ports/io-mongo.repository.port'
import { InventoryAction } from '@/modules/inoutbound/domain/types'
import { ElectronicProductCode } from '@/modules/inoutbound/domain/value-objects/epc.vo'
import { RestoreArchivedEpcsDTO } from '@/modules/inoutbound/presentation/dto/rfid-shared.dto'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { AnyBulkWriteOperation } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { InventoryEpc, InventoryEpcDocument, InventoryEpcModel } from '../schemas/inventory-epc.schema'

@Injectable()
export class InoutboundMongoRepository implements IIoMongoRepository {
	constructor(
		@InjectPinoLogger(InoutboundMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
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
						size_numcode: item.size_numcode,
						factory_code_produce: item.factory_code_produce,
						po: item.po
					})
			)
			.filter((item) => item.getIsWritable())
	}

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

	public async bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: InventoryAction
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

	public async updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<void> {
		await this.inventoryEpcModel
			.updateMany(
				{ epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }, inbound_at: null },
				{ inbound_at: new Date() }
			)
			.exec()
	}

	public async deletePendingInboundMo(
		action: InventoryAction,
		manufacturingOrder: string,
		deviceSerialNumber: string,
		rescannable: boolean
	): Promise<void> {
		await this.inventoryEpcModel
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
	}

	public async bulkDeleteEpcs(inventoryAction: InventoryAction, epcs: string[], rescannable: boolean): Promise<void> {
		await this.inventoryEpcModel
			.updateMany(
				{
					epc: { $in: epcs },
					...(inventoryAction === 'inbound' && { inbound_at: null }),
					...(inventoryAction === 'outbound' && { outbound_at: null, po: null })
				},
				{ deleted: true, scannable: rescannable }
			)
			.exec()
	}

	public async restoreArchivedEpcs(action: InventoryAction, epcs: RestoreArchivedEpcsDTO): Promise<void> {
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
