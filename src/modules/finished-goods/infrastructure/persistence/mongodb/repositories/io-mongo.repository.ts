import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IIoMongoRepository } from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { GetScanningEpcsBySizeQuery } from '@modules/finished-goods/application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockFlow, UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { flatten } from 'flat'
import { omitBy, pick, pickBy, uniq } from 'lodash'

import { AnyBulkWriteOperation, FilterQuery, mongo, type MongooseBulkWriteOptions, type PipelineStage } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
	DailyMoInventoryVariation,
	DailyMoInventoryVariationDocument,
	DailyMoInventoryVariationModel
} from '../schemas/daily-mo-inventory-variation.schema'
import {
	DailyPoShippingProgress,
	DailyPoShippingProgressDocument,
	DailyPoShippingProgressModel
} from '../schemas/daily-po-shipping-progress.schema'
import { FinishedGoodsEpcMatch, FinishedGoodsEpcMatchModel } from '../schemas/epc-match.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import {
	MoInventoryVariation,
	MoInventoryVariationDocument,
	MoInventoryVariationModel
} from '../schemas/mo-inventory-variation.schema'
import {
	PoShippingProgress,
	PoShippingProgressDocument,
	PoShippingProgressModel
} from '../schemas/po-shipping-progress.schema'

type InventoryVariationIncrementKey =
	`inventory_variation.${string}.${'stocked_in_qty' | 'total_recall_tx' | 'total_return_tx' | 'shipped_out_qty'}`

type ShippingProgressIncrementKey = `shipping_progress.${string}.shipped_out_qty`

type InventoryVariationAsync = Awaited<ReturnType<IIoMongoRepository['getPendingInventoryVariation']>>[number]

@Injectable()
export class InoutboundMongoRepository implements IIoMongoRepository {
	constructor(
		@InjectPinoLogger(InoutboundMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(FinishedGoodsEpcMatch.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcMatchModel: FinishedGoodsEpcMatchModel,
		@InjectModel(MoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryVariationModel: MoInventoryVariationModel,
		@InjectModel(PoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly poShippingProgress: PoShippingProgressModel,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariationModel: DailyMoInventoryVariationModel,
		@InjectModel(DailyPoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyPoShippingProgressModel: DailyPoShippingProgressModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	private createInventoryIncrementExpression(
		change: InventoryVariationAsync
	): Record<InventoryVariationIncrementKey, mongo.NumericType> {
		return flatten(pick(change, 'inventory_variation'))
	}

	private createShippingProgressIncrementExpression(
		change: InventoryVariationAsync
	): Record<ShippingProgressIncrementKey, mongo.NumericType> {
		return Object.entries(change.inventory_variation).reduce<
			Record<`shipping_progress.${string}.shipped_out_qty`, mongo.NumericType>
		>((acc, [size, variation]) => {
			return {
				...acc,
				[`shipping_progress.${size}.shipped_out_qty`]: variation.shipped_out_qty
			}
		}, {})
	}

	public async getEpcsInformation(epcs: Array<string>): Promise<ElectronicProductCode[]> {
		const matchedFinishedGoodsEpcs = await this.finishedGoodsEpcMatchModel.find({ epc: { $in: epcs } }).lean(true)

		return ElectronicProductCode.createFactory(
			matchedFinishedGoodsEpcs.map((item) => ({
				sku: item.epc,
				attributes: {
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					factory_code_produce: item.factory_code_produce,
					po: undefined
				}
			}))
		)
	}

	public async getPendingStockMoveEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string,
		assemblyLine?: `${string}/${string}`,
		storageLocation?: `${string}/${string}`
	): Promise<ElectronicProductCode[]> {
		const rawData = await this.finishedGoodsEpcModel
			.find({
				scannable: true,
				inbound_device_sn: deviceSerialNumber,
				mo_no: manufacturingOrder,
				storage_location: null
			})
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

	public async getPendingShipOutEpcs(
		purchaseOrder: string,
		manufacturingOrders: string | Array<string>,
		outboundSizeQuantities?: Array<{ size_numcode: string; qty: number }>
	): Promise<ElectronicProductCode[]> {
		const baseFilterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			$or: [{ deleted: false }, { deleted: null }],
			scannable: true
		}

		if (!Array.isArray(outboundSizeQuantities)) {
			const pendingOutboundEpcs = await this.finishedGoodsEpcModel
				.find({
					...baseFilterQuery,
					mo_no: {
						...(Array.isArray(manufacturingOrders) ? { $in: manufacturingOrders } : { $eq: manufacturingOrders })
					}
				})
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

		this.logger.debug(outboundSizeQuantities)
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

	public async getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: SizeNumber; order_qty: number; accumulated_qty: number }>> {
		const moInventoryVariation = await this.moInventoryVariationModel
			.findOne({ mo_no: manufacturingOrder })
			.lean(true)

		if (!moInventoryVariation) return []

		return Object.entries(moInventoryVariation.inventory_variation).map(([size, variation]) => {
			const { order_qty, stocked_in_qty, total_recall_tx, total_return_tx, shipped_out_qty } = variation

			return {
				mo_no: moInventoryVariation.mo_no,
				size_numcode: new SizeNumber(size),
				order_qty,
				accumulated_qty: stocked_in_qty - total_recall_tx + total_return_tx - shipped_out_qty
			}
		})
	}

	public async getPoOutboundProgress(
		purchaseOrder: string
	): Promise<Array<{ size_numcode: SizeNumber; order_qty: number; accumulated_qty: number }>> {
		const poShippingProgress = await this.poShippingProgress.findOne({ po: purchaseOrder }).lean(true)

		if (!poShippingProgress) return []

		return Object.entries(poShippingProgress.shipping_progress).map(([size, variation]) => {
			const { order_qty, shipped_out_qty } = variation

			return {
				size_numcode: new SizeNumber(size),
				order_qty,
				accumulated_qty: shipped_out_qty
			}
		})
	}

	public async getScanningEpcsBySize(query: GetScanningEpcsBySizeQuery): Promise<Array<{ epc: string }>> {
		const queryHint: Record<StockFlow, mongo.Hint> = {
			inbound: 'idx_inbound_active',
			outbound: 'idx_outbound_active'
		}

		const filterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			scannable: true,
			mo_no: query.manufacturingOrder,
			size_numcode: query.sizeNumber,
			status: FinishedGoodsEpcStatus.SCANNING
		}

		if (query.stockFlow === 'inbound' && query.inboundDeviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: query.inboundDeviceSerialNumber }
			filterQuery.storage_location = { $eq: null }
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
						status: FinishedGoodsEpcStatus.SCANNING,
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
	public async getPendingInventoryVariation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<
				string,
				{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
			>
		}>
	> {
		const pendingStockMoveEpcs = await this.finishedGoodsEpcModel
			.find({
				epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }
			})
			.read('primary')
			.session(this.txHost.tx)
			.lean(true)

		return pendingStockMoveEpcs.reduce<
			Array<{
				mo_no: string
				po: string | undefined | null
				factory_code_produce: string
				factory_shoes_style: string
				color_sn: string
				inventory_variation: Record<
					string,
					{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
				>
			}>
		>((acc, curr) => {
			const currentMoIndex = acc.findIndex(
				(item) =>
					item.mo_no === curr.mo_no &&
					item.factory_code_produce === curr.factory_code_produce &&
					item.factory_shoes_style === curr.factory_shoes_style &&
					item.color_sn === curr.color_sn
			)

			const pendingSizeVariation = {
				stocked_in_qty: curr.status === FinishedGoodsEpcStatus.IN_STOCK && curr.inbound_times === 1 ? 1 : 0,
				total_recall_tx: curr.status === FinishedGoodsEpcStatus.RECALLED ? 1 : 0,
				total_return_tx: curr.status === FinishedGoodsEpcStatus.IN_STOCK && curr.inbound_times > 1 ? 1 : 0,
				shipped_out_qty: curr.status === FinishedGoodsEpcStatus.SHIPPED ? 1 : 0
			}

			if (currentMoIndex === -1) {
				acc.push({
					mo_no: curr.mo_no,
					factory_code_produce: curr.factory_code_produce,
					factory_shoes_style: curr.factory_shoes_style,
					color_sn: curr.color_sn,
					po: curr.po,
					inventory_variation: {
						[curr.size_numcode]: pendingSizeVariation
					}
				})
			} else {
				const currSizeVariation = acc[currentMoIndex].inventory_variation[curr.size_numcode]
				if (!currSizeVariation) {
					acc[currentMoIndex].inventory_variation[curr.size_numcode] = pendingSizeVariation
				} else {
					acc[currentMoIndex].inventory_variation[curr.size_numcode] = {
						stocked_in_qty: currSizeVariation.stocked_in_qty + pendingSizeVariation.stocked_in_qty,
						total_recall_tx: currSizeVariation.total_recall_tx + pendingSizeVariation.total_recall_tx,
						total_return_tx: currSizeVariation.total_return_tx + pendingSizeVariation.total_return_tx,
						shipped_out_qty: currSizeVariation.shipped_out_qty + pendingSizeVariation.shipped_out_qty
					}
				}
			}

			return acc
		}, [])
	}

	/**
	 * @param pendingStockInEpcs
	 * * Cập nhật trạng thái của các EPC trong danh sách `pendingStockInEpcs` khi chúng được nhập kho (stock in).
	 * * Các bước thực hiện:
	 * 	1. Cập nhật trạng thái của các EPC trong collection `FinishedGoodsEpc`.
	 * 	2. Lấy số lượng biến động tồn kho (inventory variation) từ các EPC đã nhập kho.
	 * 	3. Cập nhật số lượng tồn kho trong collection `MoInventoryVariation` dựa trên các EPC đã nhập kho.
	 * 	4. Cập nhật biến động tồn kho hàng ngày trong collection `DailyMoInventoryVariation` dựa trên các EPC đã nhập kho.
	 * @return {void}
	 */
	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkUpdateEpcOperators: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingStockInEpcs.map(
			(epc) => ({
				updateOne: {
					filter: { epc: epc.getStockKeepingUnit() },
					update: [
						// * Stage 1: Cập nhật trạng thái status dựa trên status
						{
							$set: {
								status: {
									$cond: [
										{ $in: ['$status', [FinishedGoodsEpcStatus.SCANNING, FinishedGoodsEpcStatus.RECALLED]] },
										FinishedGoodsEpcStatus.IN_STOCK,
										'$status'
									]
								},
								inbound_times: { $add: [{ $ifNull: ['$inbound_times', 0] }, 1] } // * Tăng số lần nhập kho (inbound_times) lên 1 mỗi khi `stockIn` được gọi
							}
						},
						{
							$set: {
								inbound_at: {
									$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.SCANNING] }, '$inbound_at', '$$NOW'] // *  đã nhập, thì giữ nguyên ngày nhập, chưa nhập thì update ngày nhập = ngày hiện tại
								},
								assembly_line: {
									code: epc.getAssemblyLine('code'),
									name: epc.getAssemblyLine('name', 'sanitized')
								},
								storage_location: { code: epc.getStorageLocation('code'), name: epc.getStorageLocation('name') }
							}
						},
						{
							$set: {
								returned_at: {
									$cond: [
										{
											$and: [
												{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
												{ $gt: ['$inbound_times', 1] }
											]
										},
										'$$NOW',
										'$returned_at'
									]
								}
							}
						},
						{
							$set: {
								recalled_at: {
									$cond: [
										{
											// * nếu đã trả (status = returned) nhưng không có ngày thu hồi (recalled_at)
											$and: [
												{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
												{ $gt: ['$inbound_times', 1] },
												{ $in: [{ $type: '$recalled_at' }, ['null', 'undefined', 'missing']] }
											]
										},
										'$$NOW',
										'$recalled_at'
									]
								}
							}
						}
					]
				}
			})
		)

		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		await this.finishedGoodsEpcModel.bulkWrite(bulkUpdateEpcOperators, bulkWriteConcernSettings)

		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingStockInEpcs)

		const bulkWriteMasterVariationOperator: AnyBulkWriteOperation<MoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => ({
				updateOne: {
					filter: {
						mo_no: mo.mo_no,
						factory_code_produce: mo.factory_code_produce,
						factory_shoes_style: mo.factory_shoes_style,
						color_sn: mo.color_sn
					},
					update: { $inc: this.createInventoryIncrementExpression(mo) },
					upsert: true
				}
			}))

		const date = format(new Date(), 'yyyy-MM-dd')

		const storageLocations = uniq(pendingStockInEpcs.map((epc) => epc.getStorageLocation('name')))
		const assemblyLines = uniq(pendingStockInEpcs.map((epc) => epc.getAssemblyLine('name', 'sanitized')))

		// * Cập nhật biến động tồn kho hàng ngày trong collection `DailyMoInventoryVariation` dựa trên các EPC đã nhập kho
		const bulkWriteDailyVariationOperator: AnyBulkWriteOperation<DailyMoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const { mo_no } = mo
				const incrementExpression = omitBy(this.createInventoryIncrementExpression(mo), (_, key) =>
					key.endsWith('shipped_out_qty')
				)

				return {
					updateOne: {
						filter: { mo_no, date },
						update: {
							$setOnInsert: { date, mo_no },
							$inc: incrementExpression,
							$addToSet: {
								storage_locations: { $each: storageLocations },
								assembly_lines: { $each: assemblyLines }
							}
						},
						upsert: true
					}
				}
			})

		await this.dailyMoInventoryVariationModel.bulkWrite(bulkWriteDailyVariationOperator, bulkWriteConcernSettings)

		await this.moInventoryVariationModel.bulkWrite(bulkWriteMasterVariationOperator, bulkWriteConcernSettings)
	}

	/**
	 * @param pendingShipOutEpcs
	 * @description Cập nhật trạng thái của các EPC trong danh sách `pendingShipOutEpcs` khi chúng được xuất kho (stock out).
	 * @tutorial {ShippingWorkflow} Cần 6 round trips:
	 *
	 * 	1. Cập nhật trạng thái của các EPC trong collection `FinishedGoodsEpc`.
	 * 	2. Lấy số lượng biến động tồn kho (inventory variation) từ các EPC đã xuất kho.
	 * 	3. Cập nhật số lượng tồn kho trong collection `MoInventoryVariation` dựa trên các EPC đã xuất kho.
	 * 	4. Cập nhật biến động tồn kho hàng ngày trong collection `DailyMoInventoryVariation` dựa trên các EPC đã xuất kho.
	 * 	5. Cập nhật tiến độ xuất kho (outbound progress) cho từng size trong collection `PoShippingProgress` dựa trên các EPC đã xuất kho.
	 * 	6. Cập nhật số lượng xuất kho trong ngày (daily shipped out quantity) cho từng size trong collection `DailyPoShippingProgress` dựa trên các EPC đã xuất kho.
	 * @return {void}
	 */
	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void> {
		// * Update thông tin và trạng thái xuất kho (stock out) của các EPC trong collection `FinishedGoodsEpc`
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingShipOutEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit(), status: FinishedGoodsEpcStatus.SCANNING, outbound_at: null },
				update: {
					outbound_at: new Date(),
					po: epc.getPurchaseOrder(),
					status: FinishedGoodsEpcStatus.SHIPPED,
					scannable: false // * Khi EPC được xuất kho (stock out), nó sẽ không còn khả năng quét (scannable) nữa
				}
			}
		}))

		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		await this.finishedGoodsEpcModel.bulkWrite(bulkWriteOperations, bulkWriteConcernSettings)

		// * Lấy số lượng biến động tồn kho (inventory variation) từ các EPC đã xuất kho
		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingShipOutEpcs)

		// * Cập nhật số lượng xuất kho cho từng chỉ lệnh (MO) trong collection `MoInventoryVariation` dựa trên các EPC đã xuất kho
		const bulkWriteMasterVariationOperator: AnyBulkWriteOperation<MoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const incrementExpression = pickBy(this.createInventoryIncrementExpression(mo), (_, key) =>
					key.endsWith('shipped_out_qty')
				)

				return {
					updateOne: {
						filter: {
							mo_no: mo.mo_no,
							factory_code_produce: mo.factory_code_produce,
							factory_shoes_style: mo.factory_shoes_style,
							color_sn: mo.color_sn
						},
						update: { $inc: incrementExpression },
						upsert: true
					}
				}
			})

		await this.moInventoryVariationModel.bulkWrite(bulkWriteMasterVariationOperator, bulkWriteConcernSettings)

		// * Cập nhật lại tiến độ xuất kho (outbound progress) cho từng size trong collection `PoShippingProgress` dựa trên các EPC đã xuất kho

		const poShippingProgressBulkWriteOperator: AnyBulkWriteOperation<PoShippingProgressDocument>[] =
			pendingInventoryVariation.map((change) => {
				const increments = {}
				for (const [size, variation] of Object.entries(change.inventory_variation)) {
					increments[`shipping_progress.${size}.shipped_out_qty`] = variation.shipped_out_qty
				}

				return {
					updateOne: {
						filter: { po: change.po },
						update: { $inc: this.createShippingProgressIncrementExpression(change) }
					}
				}
			})

		await this.poShippingProgress.bulkWrite(poShippingProgressBulkWriteOperator, bulkWriteConcernSettings)

		const date = format(new Date(), 'yyyy-MM-dd')

		// * Cập nhật số lượng xuất trong ngày theo đặt đơn khách hàng (PO)
		const dailyShippingBulkWriteOperator: AnyBulkWriteOperation<DailyPoShippingProgressDocument>[] =
			pendingInventoryVariation.map((change) => {
				const { po } = change

				const incrementExpression = Object.entries(change.inventory_variation).reduce((acc, [size, variation]) => {
					return {
						...acc,
						[`shipping_progress.${change.mo_no}.${size}`]: variation.shipped_out_qty
					}
				}, {})

				return {
					updateOne: {
						filter: { po, date },
						update: {
							$setOnInsert: { po, date },
							$inc: incrementExpression
						},
						upsert: true
					}
				}
			})

		await this.dailyPoShippingProgressModel.bulkWrite(dailyShippingBulkWriteOperator, bulkWriteConcernSettings)
	}

	/**
	 * @param pendingStockInEpcs
	 * * Cập nhật trạng thái của các EPC trong danh sách `pendingRecallEpcs` khi chúng được thu hồi (recall).
	 * * Cần 4 round trips:
	 * 	1. Cập nhật trạng thái của các EPC trong collection `FinishedGoodsEpc`.
	 * 	2. Lấy số lượng biến động tồn kho (inventory variation) từ các EPC đã nhập kho.
	 * 	3. Cập nhật số lượng tồn kho trong collection `MoInventoryVariation` dựa trên các EPC đã nhập kho.
	 * 	4. Cập nhật biến động tồn kho hàng ngày trong collection `DailyMoInventoryVariation` dựa trên các EPC đã nhập kho.
	 * @return {void}
	 */
	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async recallFromStock(pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void> {
		await this.finishedGoodsEpcModel.updateMany(
			{ epc: { $in: pendingRecallEpcs.map((e) => e.getStockKeepingUnit()) } },
			{
				recalled_at: new Date(),
				status: FinishedGoodsEpcStatus.RECALLED,
				storage_location: null
			},
			{ session: this.txHost.tx }
		)

		const date = format(new Date(), 'yyyy-MM-dd')

		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingRecallEpcs)

		const createIncrementExpression = (obj: object): Record<string, mongo.NumericType> => {
			return flatten(pick(obj, 'inventory_variation'))
		}

		const bulkWriteMasterVariationOperator: AnyBulkWriteOperation<MoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => ({
				updateOne: {
					filter: {
						mo_no: mo.mo_no,
						factory_code_produce: mo.factory_code_produce,
						factory_shoes_style: mo.factory_shoes_style,
						color_sn: mo.color_sn
					},
					update: { $inc: createIncrementExpression(mo) },
					upsert: true
				}
			}))

		const bulkWriteDailyVariationOperator: AnyBulkWriteOperation<DailyMoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const { mo_no, factory_code_produce, factory_shoes_style, color_sn } = mo
				return {
					updateOne: {
						filter: { mo_no, date },
						update: {
							$setOnInsert: { date, mo_no, factory_code_produce, factory_shoes_style, color_sn },
							$inc: createIncrementExpression(mo)
						},
						upsert: true
					}
				}
			})

		await this.dailyMoInventoryVariationModel.bulkWrite(bulkWriteDailyVariationOperator, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		await this.moInventoryVariationModel.bulkWrite(bulkWriteMasterVariationOperator, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void> {
		await this.finishedGoodsEpcMatchModel
			.updateMany({ epc: { $in: pendingExchangeEpcs } }, { mo_no: targetMo })
			.session(this.txHost.tx)

		await this.finishedGoodsEpcModel
			.updateMany({ epc: { $in: pendingExchangeEpcs } }, { mo_no: targetMo })
			.session(this.txHost.tx)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async updateScanningEpcsMatch(data: UpsertEpcsMatchData): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = data.map((item) => ({
			updateOne: {
				filter: { epc: item.epc },
				update: {
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: item.size_numcode,
					factory_code_produce: item.factory_code_produce
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
}
