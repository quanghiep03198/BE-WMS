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
import { pick, uniq } from 'lodash'
import { AnyBulkWriteOperation, FilterQuery, mongo, type PipelineStage } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
	DailyMoInventoryVariation,
	DailyMoInventoryVariationDocument,
	DailyMoInventoryVariationModel
} from '../schemas/daily-mo-inventory-variation.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import {
	MoInventoryVariation,
	MoInventoryVariationDocument,
	MoInventoryVariationModel
} from '../schemas/mo-inventory-variation.schema'
@Injectable()
export class InoutboundMongoRepository implements IIoMongoRepository {
	constructor(
		@InjectPinoLogger(InoutboundMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(MoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryVariationModel: MoInventoryVariationModel,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariationModel: DailyMoInventoryVariationModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

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

	public async getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ size_numcode: SizeNumber; size_qty: number; accumulated_qty: number }>> {
		const moInventoryVariation = await this.moInventoryVariationModel
			.findOne({ mo_no: manufacturingOrder })
			.lean(true)

		if (!moInventoryVariation) return []

		return Object.entries(moInventoryVariation.inventory_variation).map(([size, variation]) => {
			const { target_qty, stocked_in_qty, total_recall_tx, total_return_tx, shipped_out_qty } = variation

			return {
				size_numcode: new SizeNumber(size),
				size_qty: target_qty,
				accumulated_qty: stocked_in_qty - total_recall_tx + total_return_tx - shipped_out_qty
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
			size_numcode: query.sizeNumber
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
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<
				string,
				{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
			>
		}>
	> {
		const aggregateQuery = this.finishedGoodsEpcModel
			.aggregate<{
				mo_no: string
				factory_code_produce: string
				factory_shoes_style: string
				color_sn: string
				inventory_variation: Record<
					string,
					{
						stocked_in_qty: number
						total_recall_tx: number
						total_return_tx: number
						shipped_out_qty: number
					}
				>
			}>(
				[
					{
						$match: {
							epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }
						}
					},
					{
						$addFields: {
							is_inbound: {
								$cond: [
									{
										$and: [
											{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
											{ $eq: ['$inbound_times', 1] }
										]
									},
									1,
									0
								]
							},
							is_recall: {
								$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.RECALLED] }, 1, 0]
							},
							is_return: {
								$cond: [{ $gt: ['$inbound_times', 1] }, 1, 0]
							},
							is_shipped_out: {
								$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.SHIPPED] }, 1, 0]
							}
						}
					},
					{
						$group: {
							_id: {
								mo_no: '$mo_no',
								factory_shoes_style: '$factory_shoes_style',
								color_sn: '$color_sn',
								factory_code_produce: '$factory_code_produce'
							},
							sizes: {
								$push: {
									size_numcode: '$size_numcode',
									stocked_in_qty: '$is_inbound',
									total_recall_tx: '$is_recall',
									total_return_tx: '$is_return',
									shipped_out_qty: '$is_shipped_out'
								}
							},
							total_qty: { $sum: 1 }
						}
					},
					{
						$lookup: {
							from: 'mo_inventory_variation',
							let: {
								mo_no: '$_id.mo_no',
								factory_code_produce: '$_id.factory_code_produce',
								factory_shoes_style: '$_id.factory_shoes_style',
								color_sn: '$_id.color_sn'
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ['$mo_no', '$$mo_no'] },
												{ $eq: ['$factory_code_produce', '$$factory_code_produce'] },
												{ $eq: ['$factory_shoes_style', '$$factory_shoes_style'] },
												{ $eq: ['$color_sn', '$$color_sn'] }
											]
										}
									}
								},
								{
									$project: {
										_id: 0,
										mo_total_qty: 1,
										sizes: 1
									}
								}
							],
							as: 'mo_info'
						}
					},
					{
						$addFields: {
							mo_info: {
								$arrayElemAt: ['$mo_info', 0]
							}
						}
					},
					{
						$project: {
							_id: 0,
							mo_no: '$_id.mo_no',
							factory_code_produce: '$_id.factory_code_produce',
							factory_shoes_style: '$_id.factory_shoes_style',
							color_sn: '$_id.color_sn',
							mo_total_qty: '$mo_info.mo_total_qty',
							inventory_variation: {
								$let: {
									vars: {
										sizeGroups: {
											$map: {
												input: {
													$setUnion: [
														{
															$map: {
																input: '$sizes',
																as: 's',
																in: '$$s.size_numcode'
															}
														},
														[]
													]
												},
												as: 'size',
												in: {
													k: '$$size',
													v: {
														target_qty: {
															$getField: {
																field: '$$size',
																input: '$mo_info.sizes'
															}
														},
														stocked_in_qty: {
															$sum: {
																$map: {
																	input: {
																		$filter: {
																			input: '$sizes',
																			as: 's',
																			cond: { $eq: ['$$s.size_numcode', '$$size'] }
																		}
																	},
																	as: 'x',
																	in: '$$x.stocked_in_qty'
																}
															}
														},
														total_recall_tx: {
															$sum: {
																$map: {
																	input: {
																		$filter: {
																			input: '$sizes',
																			as: 's',
																			cond: { $eq: ['$$s.size_numcode', '$$size'] }
																		}
																	},
																	as: 'x',
																	in: '$$x.total_recall_tx'
																}
															}
														},
														total_return_tx: {
															$sum: {
																$map: {
																	input: {
																		$filter: {
																			input: '$sizes',
																			as: 's',
																			cond: { $eq: ['$$s.size_numcode', '$$size'] }
																		}
																	},
																	as: 'x',
																	in: '$$x.total_return_tx'
																}
															}
														},
														shipped_out_qty: {
															$sum: {
																$map: {
																	input: {
																		$filter: {
																			input: '$sizes',
																			as: 's',
																			cond: { $eq: ['$$s.size_numcode', '$$size'] }
																		}
																	},
																	as: 'x',
																	in: '$$x.shipped_out_qty'
																}
															}
														}
													}
												}
											}
										}
									},
									in: {
										$arrayToObject: '$$sizeGroups'
									}
								}
							}
						}
					}
				],
				{
					readConcern: { level: 'majority' },
					readPreference: 'primary'
				}
			)
			.session(this.txHost.tx)

		return await aggregateQuery
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void> {
		const epcBulkUpdateRequests: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingStockInEpcs.map(
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
								assembly_line: epc.getAssemblyLine('code'),
								storage_location: epc.getStorageLocation('code')
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

		await this.finishedGoodsEpcModel.bulkWrite(epcBulkUpdateRequests, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingStockInEpcs)

		const createIncrementExpression = (obj: Object): Record<string, mongo.NumericType> => {
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

		const date = format(new Date(), 'yyyy-MM-dd')

		const storageLocations = uniq(pendingStockInEpcs.map((epc) => epc.getStorageLocation('name')))
		const assemblyLines = uniq(pendingStockInEpcs.map((epc) => epc.getAssemblyLine('name', 'sanitized')))

		const bulkWriteDailyVariationOperator: AnyBulkWriteOperation<DailyMoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const { mo_no, factory_code_produce, factory_shoes_style, color_sn } = mo
				return {
					updateOne: {
						filter: { mo_no, date },
						update: {
							$setOnInsert: {
								date,
								mo_no,
								factory_code_produce,
								factory_shoes_style,
								color_sn
							},
							$inc: createIncrementExpression(mo),
							$addToSet: {
								storage_locations: { $each: storageLocations },
								assembly_lines: { $each: assemblyLines }
							}
						},
						upsert: true
					}
				}
			})

		const result = await this.dailyMoInventoryVariationModel.bulkWrite(bulkWriteDailyVariationOperator, {
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
	public async stockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteOperations: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = pendingShipOutEpcs.map((epc) => ({
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

		const createIncrementExpression = (obj: Object): Record<string, mongo.NumericType> => {
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
	public async exchangeMo(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void> {
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
