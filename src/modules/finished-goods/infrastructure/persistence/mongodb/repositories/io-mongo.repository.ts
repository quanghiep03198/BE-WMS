import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IIoMongoRepository } from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { GetScanningEpcsBySizeQuery } from '@modules/finished-goods/application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { AnyBulkWriteOperation, FilterQuery, mongo, type PipelineStage } from 'mongoose'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
@Injectable()
export class InoutboundMongoRepository implements IIoMongoRepository {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	public async getPendingInboundEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string,
		assemblyLine: string,
		storageLocation: string
	): Promise<ElectronicProductCode[]> {
		const rawData = await this.finishedGoodsEpcModel
			.find({ scannable: true, inbound_device_sn: deviceSerialNumber, mo_no: manufacturingOrder })
			.lean()
		return ElectronicProductCode.createFactory(
			rawData.map((item) => ({
				sku: item.epc,
				attributes: {
					scannable: item.scannable,
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					factory_code_produce: item.factory_code_produce,
					assembly_line: assemblyLine,
					storage_location: storageLocation,
					po: item.po
				}
			}))
		).filter((item) => item.getIsWritable())
	}

	public async getPendingOutboundEpcs(
		purchaseOrder: string,
		manufacturingOrders: string | Array<string>,
		outboundSizeQuantities?: Array<{ size_numcode: string; qty: number }>
	): Promise<ElectronicProductCode[]> {
		const baseFilterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			$or: [{ deleted: false }, { deleted: null }],
			scannable: true
		}

		if (typeof manufacturingOrders === 'string' && !Array.isArray(outboundSizeQuantities)) {
			const pendingOutboundEpcs = await this.finishedGoodsEpcModel
				.find({ ...baseFilterQuery, mo_no: manufacturingOrders })
				.lean(true)

			return ElectronicProductCode.createFactory(
				pendingOutboundEpcs.map((item) => ({
					sku: item.epc,
					attributes: {
						mo_no: item.mo_no,
						factory_shoes_style: item.factory_shoes_style,
						color_sn: item.color_sn,
						size_numcode: item.size_numcode,
						factory_code_produce: item.factory_code_produce,
						po: purchaseOrder
					}
				}))
			)
		}

		const facetPipeline = outboundSizeQuantities.reduce<PipelineStage.Facet['$facet']>((acc, curr) => {
			return {
				...acc,
				[curr.size_numcode.replace('.', '')]: [
					{ $match: { ...baseFilterQuery, mo_no: manufacturingOrders, size_numcode: curr.size_numcode } },
					{
						$project: {
							_id: 0,
							epc: 1,
							mo_no: 1,
							size_numcode: 1,
							station_no: 1,
							factory_code_produce: 1
						}
					},
					{ $limit: curr.qty }
				]
			}
		}, {})
		const aggregatedEpcData = await this.finishedGoodsEpcModel.aggregateWithDeleted([{ $facet: facetPipeline }])
		const extractedValues = Object.values<Partial<FinishedGoodsEpcDocument>[]>(aggregatedEpcData[0])
		const pendingOutboundEpcs = extractedValues.every((facetGroup) => Array.isArray(facetGroup))
			? extractedValues.flat()
			: []

		return ElectronicProductCode.createFactory(
			pendingOutboundEpcs.map((item) => ({
				sku: item.epc,
				attributes: {
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					factory_code_produce: item.factory_code_produce,
					po: item.po
				}
			}))
		)
	}

	public async getPendingExchangeEpcs(query: {
		deviceSerialNumber: string
		manufacturingOrder: string
		// sizeNumber: string
		quantity: number
	}): Promise<
		Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	> {
		return await this.finishedGoodsEpcModel.find(
			{
				mo_no: query.manufacturingOrder,
				// size_numcode: query.sizeNumber,
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
		const epcs = await this.finishedGoodsEpcModel
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

	public async getScanningEpcsBySize(query: GetScanningEpcsBySizeQuery): Promise<Array<{ epc: string }>> {
		const queryHint: Record<StockFlow, mongo.Hint> = {
			inbound: 'idx_inbound_active',
			outbound: 'idx_outbound_active'
		}

		const filterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			scannable: true,
			mo_no: query.manufacturingOrder,
			size_numcode: query.sizeNumber
		}

		if (query.stockFlow === 'inbound' && query.inboundDeviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: query.inboundDeviceSerialNumber }
			filterQuery.inbound_at = { $eq: null }
		}

		if (query.stockFlow === 'outbound') {
			filterQuery.outbound_at = { $eq: null }
			filterQuery.po = { $eq: null }
		}

		return await this.finishedGoodsEpcModel
			.find(filterQuery, { _id: 0, epc: 1 }, { lean: true, limit: query.limit })
			.hint(queryHint[query.stockFlow])
	}

	public async bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockFlow
		payload: { epcs: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void> {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')

		const bulkWriteOptions: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = payload.epcs.map((item) => {
			const operation: AnyBulkWriteOperation<FinishedGoodsEpcDocument> = {
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
							inbound_device_sn: payload.deviceSerialNumber,
							storage_location: null,
							...(!isDeduplicationEnabled && { deleted: false })
						}),
						...(action === 'outbound' && {
							outbound_device_sn: payload.deviceSerialNumber
						})
					},
					setDefaultsOnInsert: false,
					upsert: true,
					...(action === 'inbound' && isDeduplicationEnabled && { overwriteImmutable: true })
				}
			}

			return operation
		})

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async commitStockIn(scannedEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = scannedEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit(), storage_location: null },
				update: {
					inbound_at: new Date(),
					assembly_line: epc.getAssemblyLine(),
					storage_location: epc.getStorageLocation()
				}
			}
		}))

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOperations, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
		// await this.finishedGoodsEpcModel
		// 	.updateMany(
		// 		{ epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }, inbound_at: null },
		// 		{ inbound_at: new Date(), assembly_line: assemblyLine, storage_location: storageLocation }
		// 	)
		// 	.session(this.txHost.tx)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async commitStockOut(scannedEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = scannedEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit(), outbound_at: null },
				update: {
					outbound_at: new Date(),
					po: epc.getPurchaseOrder()
				}
			}
		}))

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOperations, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async exchangeMo(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void> {
		await this.finishedGoodsEpcModel
			.updateMany({ epc: { $in: pendingExchangeEpcs } }, { mo_no: targetMo })
			.session(this.txHost.tx)
	}
}
