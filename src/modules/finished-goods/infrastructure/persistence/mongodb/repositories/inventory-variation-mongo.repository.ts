import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IInventoryVariationMongoRepository } from '@modules/finished-goods/application/ports/inventory-variation-mongo.repository.port'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { flatten } from 'flat'
import { omitBy, pick, pickBy } from 'lodash'
import { mongo } from 'mongoose'

import {
	IInventoryAuditRepository,
	INVENTORY_AUDIT_REPOSITORY
} from '@modules/inventory/application/ports/inventory-audit.port.interface'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { format } from 'date-fns'
import { AnyBulkWriteOperation, MongooseBulkWriteOptions } from 'mongoose'
import {
	DailyMoInventoryVariation,
	DailyMoInventoryVariationDocument,
	DailyMoInventoryVariationModel
} from '../schemas/daily-mo-inventory-variation.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import {
	ManufacturingOrder,
	ManufacturingOrderDocument,
	ManufacturingOrderModel
} from '../schemas/manufacturing-order.schema'

type InventoryVariationIncrementKey =
	`inventory_variation.${string}.${'stocked_in_qty' | 'total_recall_tx' | 'total_return_tx' | 'shipped_out_qty'}`

type InventoryVariationAsync = Awaited<
	ReturnType<InventoryVariationMongoRepository['getPendingInventoryVariation']>
>[number]

@Injectable()
export class InventoryVariationMongoRepository implements IInventoryVariationMongoRepository {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariationModel: DailyMoInventoryVariationModel,
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	private createInventoryIncrementExpression(
		change: InventoryVariationAsync
	): Record<InventoryVariationIncrementKey, mongo.NumericType> {
		return flatten(pick(change, 'inventory_variation'))
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
		return await this.finishedGoodsEpcModel
			.aggregate<{
				mo_no: string
				po: string | undefined | null
				factory_code_produce: string
				factory_shoes_style: string
				color_sn: string
				inventory_variation: Record<
					string,
					{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
				>
			}>([
				{
					$match: {
						epc: { $in: scannedEpcs.map((epc) => epc.getStockKeepingUnit()) }
					}
				},
				{ $sort: { _id: 1 } },
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							factory_code_produce: '$factory_code_produce',
							factory_shoes_style: '$factory_shoes_style',
							color_sn: '$color_sn',
							size_numcode: '$size_numcode'
						},
						po: { $first: '$po' },
						stocked_in_qty: {
							$sum: {
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
							}
						},
						total_recall_tx: {
							$sum: {
								$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.RECALLED] }, 1, 0]
							}
						},
						total_return_tx: {
							$sum: {
								$cond: [
									{
										$and: [
											{ $eq: ['$status', FinishedGoodsEpcStatus.IN_STOCK] },
											{ $gt: ['$inbound_times', 1] }
										]
									},
									1,
									0
								]
							}
						},
						shipped_out_qty: {
							$sum: {
								$cond: [{ $eq: ['$status', FinishedGoodsEpcStatus.SHIPPED] }, 1, 0]
							}
						}
					}
				},
				{
					$group: {
						_id: {
							mo_no: '$_id.mo_no',
							factory_code_produce: '$_id.factory_code_produce',
							factory_shoes_style: '$_id.factory_shoes_style',
							color_sn: '$_id.color_sn'
						},
						po: { $first: '$po' },
						inventory_variation: {
							$push: {
								k: '$_id.size_numcode',
								v: {
									stocked_in_qty: '$stocked_in_qty',
									total_recall_tx: '$total_recall_tx',
									total_return_tx: '$total_return_tx',
									shipped_out_qty: '$shipped_out_qty'
								}
							}
						}
					}
				},
				{
					$project: {
						_id: 0,
						mo_no: '$_id.mo_no',
						po: 1,
						factory_code_produce: '$_id.factory_code_produce',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn',
						inventory_variation: { $arrayToObject: '$inventory_variation' }
					}
				}
			])
			.read('primary')
			.session(this.txHost.tx)
	}

	public async getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>> {
		const moInventoryVariation = await this.manufacturingOrderModel.findOne({ mo_no: manufacturingOrder }).lean(true)

		if (!moInventoryVariation) return []

		return Object.entries(moInventoryVariation.inventory_variation).map(([size, variation]: [string, any]) => {
			const { order_qty, stocked_in_qty, total_recall_tx, total_return_tx, shipped_out_qty } = variation

			return {
				mo_no: moInventoryVariation.mo_no,
				size_numcode: size,
				order_qty,
				accumulated_qty: stocked_in_qty - total_recall_tx + total_return_tx - shipped_out_qty
			}
		})
	}

	public async applyInventoryVariationForStockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingStockInEpcs)

		const bulkWriteMasterVariationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
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

		const bulkWriteDailyVariationOperator: AnyBulkWriteOperation<DailyMoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const incrementExpression = omitBy(this.createInventoryIncrementExpression(mo), (_, key) =>
					key.endsWith('shipped_out_qty')
				)

				return {
					updateOne: {
						filter: { mo_no: mo.mo_no, date },
						update: {
							$setOnInsert: { date, mo_no: mo.mo_no },
							$inc: incrementExpression
						},
						upsert: true
					}
				}
			})

		await this.dailyMoInventoryVariationModel.bulkWrite(bulkWriteDailyVariationOperator, bulkWriteConcernSettings)
		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterVariationOperator, bulkWriteConcernSettings)
		await this.inventoryAuditRepository.updateInventoryAuditVariation(pendingInventoryVariation)
	}

	public async applyInventoryVariationForStockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void> {
		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingShipOutEpcs)

		const bulkWriteMasterVariationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
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

		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterVariationOperator, bulkWriteConcernSettings)
		await this.inventoryAuditRepository.updateInventoryAuditVariation(pendingInventoryVariation)
	}

	public async applyInventoryVariationForRecall(pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void> {
		const pendingInventoryVariation = await this.getPendingInventoryVariation(pendingRecallEpcs)

		const bulkWriteMasterVariationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const incrementExpression = pickBy(this.createInventoryIncrementExpression(mo), (_, key) =>
					key.endsWith('total_recall_tx')
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

		const date = format(new Date(), 'yyyy-MM-dd')
		const bulkWriteDailyVariationOperator: AnyBulkWriteOperation<DailyMoInventoryVariationDocument>[] =
			pendingInventoryVariation.map((mo) => {
				const incrementExpression = pickBy(this.createInventoryIncrementExpression(mo), (_, key) =>
					key.endsWith('total_recall_tx')
				)

				return {
					updateOne: {
						filter: { mo_no: mo.mo_no, date },
						update: {
							$setOnInsert: { date, mo_no: mo.mo_no },
							$inc: incrementExpression
						},
						upsert: true
					}
				}
			})

		await this.dailyMoInventoryVariationModel.bulkWrite(bulkWriteDailyVariationOperator, {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterVariationOperator, {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		await this.inventoryAuditRepository.updateInventoryAuditVariation(pendingInventoryVariation)
	}
}
