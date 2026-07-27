import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IIoMongoRepository } from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { GetScanningEpcsBySizeQuery } from '@modules/finished-goods/application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { StockFlow, UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cache } from 'cache-manager'
import { AnyBulkWriteOperation, FilterQuery, mongo, type PipelineStage } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import { MoInventoryVariationModel } from '../schemas/mo-inventory-variation.schema'
@Injectable()
export class InoutboundMongoRepository implements IIoMongoRepository {
	constructor(
		@InjectPinoLogger(InoutboundMongoRepository.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryVariationModel: MoInventoryVariationModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	public async getPendingInboundOrRecallEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string,
		assemblyLine: `${string}/${string}`,
		storageLocation: string,
		isRecalled?: boolean
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
					po: item.po,
					...(isRecalled && { recall_at: null })
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
	public async getInventoryVariation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<
				string,
				{ stocked_in_qty: number; recalled_qty: number; returned_qty: number; shipped_out_qty: number }
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
					{ stocked_in_qty: number; recalled_qty: number; returned_qty: number; shipped_out_qty: number }
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
											{
												$eq: [{ $type: '$inbound_at' }, 'date']
											},
											{
												$ne: [{ $type: '$returned_at' }, 'date']
											}
										]
									},
									1,
									0
								]
							},
							is_recall: {
								$cond: [
									{
										$and: [
											{
												$eq: [{ $type: '$recalled_at' }, 'date']
											},
											{
												$ne: [{ $type: '$returned_at' }, 'date']
											}
										]
									},
									1,
									0
								]
							},
							is_return: {
								$cond: [{ $eq: [{ $type: '$returned_at' }, 'date'] }, 1, 0]
							},
							is_shipped_out: {
								$cond: [{ $eq: [{ $type: '$outbound_at' }, 'date'] }, 1, 0]
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
									recalled_qty: '$is_recall',
									returned_qty: '$is_return',
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
														recalled_qty: {
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
																	in: '$$x.recalled_qty'
																}
															}
														},
														returned_qty: {
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
																	in: '$$x.returned_qty'
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
	public async stockIn(scannedEpcs: Array<ElectronicProductCode>): Promise<void> {
		const epcBulkUpdateRequests: AnyBulkWriteOperation<FinishedGoodsEpcDocument>[] = scannedEpcs.map((epc) => ({
			updateOne: {
				filter: { epc: epc.getStockKeepingUnit() },
				update: [
					{
						$set: {
							returned_at: {
								$cond: [{ $eq: [{ $type: '$inbound_at' }, 'date'] }, '$$NOW', '$returned_at']
							},
							inbound_at: {
								$cond: [{ $eq: [{ $type: '$inbound_at' }, 'date'] }, '$inbound_at', '$$NOW']
							},
							assembly_line: epc.getAssemblyLine('code'),
							storage_location: epc.getStorageLocation()
						}
					}
				]
			}
		}))

		await this.finishedGoodsEpcModel.bulkWrite(epcBulkUpdateRequests, {
			session: this.txHost.tx,
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		// const moInventoryVariationBulkUpdateRequests: AnyBulkWriteOperation<MoInventoryVariationDocument>[] = []

		const pendingInventoryVariation = await this.getInventoryVariation(scannedEpcs)

		const toNumericAdd = (path: string, increment: number) => ({
			$add: [
				{
					$cond: [{ $in: [{ $type: path }, ['int', 'long', 'double', 'decimal']] }, path, 0]
				},
				increment
			]
		})
		for (const mo of pendingInventoryVariation) {
			const setUpdate: Record<string, unknown> = {}
			for (const [size, value] of Object.entries(mo.inventory_variation)) {
				setUpdate[`inventory_variation.${size}.stocked_in_qty`] = toNumericAdd(
					`$inventory_variation.${size}.stocked_in_qty`,
					value.stocked_in_qty ?? 0
				)
				setUpdate[`inventory_variation.${size}.recalled_qty`] = toNumericAdd(
					`$inventory_variation.${size}.recalled_qty`,
					value.recalled_qty ?? 0
				)
				setUpdate[`inventory_variation.${size}.returned_qty`] = toNumericAdd(
					`$inventory_variation.${size}.returned_qty`,
					value.returned_qty ?? 0
				)
				setUpdate[`inventory_variation.${size}.shipped_out_qty`] = toNumericAdd(
					`$inventory_variation.${size}.shipped_out_qty`,
					value.shipped_out_qty ?? 0
				)
			}

			await this.moInventoryVariationModel.updateOne(
				{
					mo_no: mo.mo_no,
					factory_code_produce: mo.factory_code_produce,
					factory_shoes_style: mo.factory_shoes_style,
					color_sn: mo.color_sn
				},
				{ $set: setUpdate },
				{ session: this.txHost.tx }
			)
		}
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async stockOut(scannedEpcs: Array<ElectronicProductCode>): Promise<void> {
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
