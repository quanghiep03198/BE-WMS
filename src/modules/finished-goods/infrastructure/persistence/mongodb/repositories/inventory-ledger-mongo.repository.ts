import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IInventoryLedgerMongoRepository } from '@modules/finished-goods/application/ports/inventory-ledger-mongo.repository.port'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { flatten } from 'flat'
import { omitBy, pick, pickBy } from 'lodash'
import { mongo } from 'mongoose'

import { IStockTransaction } from '@modules/finished-goods/application/types'
import {
	IInventoryAuditRepository,
	INVENTORY_AUDIT_REPOSITORY
} from '@modules/inventory/application/ports/inventory-audit.port.interface'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { format } from 'date-fns'
import { AnyBulkWriteOperation, MongooseBulkWriteOptions } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
	DailyMoInventoryLedger,
	DailyMoInventoryLedgerDocument,
	DailyMoInventoryLedgerModel
} from '../schemas/daily-mo-inventory-ledger.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import {
	ManufacturingOrder,
	ManufacturingOrderDocument,
	ManufacturingOrderModel
} from '../schemas/manufacturing-order.schema'

type InventoryFluctuationIncrementKey =
	`size_ledger.${string}.${'stocked_in_qty' | 'total_recall_tx' | 'total_return_tx' | 'shipped_out_qty'}`

type InventoryFluctuationAsync = Awaited<
	ReturnType<InventoryLedgerMongoRepository['getPendingInventoryFluctuation']>
>[number]

@Injectable()
export class InventoryLedgerMongoRepository implements IInventoryLedgerMongoRepository {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(DailyMoInventoryLedger.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryLedgerModel: DailyMoInventoryLedgerModel,
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository,
		@InjectPinoLogger(InventoryLedgerMongoRepository.name) private readonly logger: PinoLogger,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	private createInventoryIncrementExpression(
		change: InventoryFluctuationAsync | Pick<InventoryFluctuationAsync, 'mo_no' | 'size_ledger'>
	): Record<InventoryFluctuationIncrementKey, mongo.NumericType> {
		return flatten<
			Pick<InventoryFluctuationAsync, 'size_ledger'>,
			Record<InventoryFluctuationIncrementKey, mongo.NumericType>
		>(pick(change, 'size_ledger'))
	}

	private createInventoryDecrementExpression(
		change: InventoryFluctuationAsync | Pick<InventoryFluctuationAsync, 'mo_no' | 'size_ledger'>
	): Record<InventoryFluctuationIncrementKey, mongo.NumericType> {
		const decrementExpression = flatten<
			Pick<InventoryFluctuationAsync, 'size_ledger'>,
			Record<InventoryFluctuationIncrementKey, mongo.NumericType>
		>(pick(change, 'size_ledger'))
		for (const field in decrementExpression) {
			if (decrementExpression.hasOwnProperty(field) && decrementExpression[field] !== 0)
				decrementExpression[field] = -decrementExpression[field]
		}
		return decrementExpression
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async getPendingInventoryFluctuation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			size_ledger: Record<
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
				size_ledger: Record<
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
						size_ledger: {
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
						size_ledger: { $arrayToObject: '$size_ledger' }
					}
				}
			])
			.read('primary')
			.session(this.txHost.tx)
	}

	public async getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>> {
		const moInventoryBalance = await this.manufacturingOrderModel.findOne({ mo_no: manufacturingOrder }).lean(true)

		if (!moInventoryBalance) return []

		return Object.entries(moInventoryBalance.size_ledger).map(([size, balances]: [string, any]) => {
			const { order_qty, stocked_in_qty, total_recall_tx, total_return_tx, shipped_out_qty } = balances

			return {
				mo_no: moInventoryBalance.mo_no,
				size_numcode: size,
				order_qty,
				accumulated_qty: stocked_in_qty - total_recall_tx + total_return_tx - shipped_out_qty
			}
		})
	}

	public async commitInventoryLedgerOnStockIn(pendingStockInEpcs: Array<ElectronicProductCode>) {
		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		const pendingInventoryFluctuation = await this.getPendingInventoryFluctuation(pendingStockInEpcs)

		const bulkWriteMasterFluctuationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
			pendingInventoryFluctuation.map((mo) => ({
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

		const storageLocations = [...new Set(pendingStockInEpcs.map((item) => item.getStorageLocation('name')))]
		const assemblyLines = [...new Set(pendingStockInEpcs.map((item) => item.getAssemblyLine('name')))]

		const bulkWriteDailyFluctuationOperator: AnyBulkWriteOperation<DailyMoInventoryLedgerDocument>[] =
			pendingInventoryFluctuation.map((mo) => {
				this.logger.debug(mo)

				const incrementExpression = omitBy(this.createInventoryIncrementExpression(mo), (_, key) =>
					key.endsWith('shipped_out_qty')
				)

				return {
					updateOne: {
						filter: { mo_no: mo.mo_no, date },
						update: {
							$setOnInsert: { date, mo_no: mo.mo_no },
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

		await this.dailyMoInventoryLedgerModel.bulkWrite(bulkWriteDailyFluctuationOperator, bulkWriteConcernSettings)
		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterFluctuationOperator, bulkWriteConcernSettings)
		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(pendingInventoryFluctuation, storageLocations)

		return pendingInventoryFluctuation
	}

	public async commitInventoryLedgerOnStockOut(
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): ReturnType<IInventoryLedgerMongoRepository['getPendingInventoryFluctuation']> {
		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		const pendingInventoryFluctuation = await this.getPendingInventoryFluctuation(pendingShipOutEpcs)

		const bulkWriteMasterFluctuationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
			pendingInventoryFluctuation.map((mo) => {
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

		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterFluctuationOperator, bulkWriteConcernSettings)
		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(pendingInventoryFluctuation)

		return pendingInventoryFluctuation
	}

	public async commitInventoryLedgerOnRecall(
		pendingRecallEpcs: Array<ElectronicProductCode>
	): ReturnType<IInventoryLedgerMongoRepository['getPendingInventoryFluctuation']> {
		const pendingInventoryFluctuation = await this.getPendingInventoryFluctuation(pendingRecallEpcs)

		const bulkWriteMasterFluctuationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
			pendingInventoryFluctuation.map((mo) => {
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

		const bulkWriteDailyFluctuationOperator: AnyBulkWriteOperation<DailyMoInventoryLedgerDocument>[] =
			pendingInventoryFluctuation.map((mo) => {
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

		await this.dailyMoInventoryLedgerModel.bulkWrite(bulkWriteDailyFluctuationOperator, {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterFluctuationOperator, {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(pendingInventoryFluctuation)

		return pendingInventoryFluctuation
	}

	async rollbackInboundFluctuation(pendingInventoryFluctuation: Array<IStockTransaction<'inbound'>>) {
		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		}

		const bulkWriteMasterFluctuationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] =
			pendingInventoryFluctuation.map((fluctuation) => ({
				updateOne: {
					filter: { mo_no: fluctuation.mo_no },
					update: {
						$inc: this.createInventoryDecrementExpression({
							mo_no: fluctuation.mo_no,
							size_ledger: fluctuation.changes
						})
					},
					upsert: true
				}
			}))

		const bulkWriteDailyFluctuationOperator: AnyBulkWriteOperation<DailyMoInventoryLedgerDocument>[] =
			pendingInventoryFluctuation.map((fluctuation) => {
				const decrementExpression = omitBy(
					this.createInventoryDecrementExpression({
						mo_no: fluctuation.mo_no,
						size_ledger: fluctuation.changes
					}),
					(_, key) => key.endsWith('shipped_out_qty')
				)

				const date = format(new Date(fluctuation.tx_at), 'yyyy-MM-dd')

				return {
					updateOne: {
						filter: { mo_no: fluctuation.mo_no, date },
						update: { $setOnInsert: { date, mo_no: fluctuation.mo_no }, $inc: decrementExpression },
						upsert: true
					}
				}
			})

		await this.dailyMoInventoryLedgerModel.bulkWrite(bulkWriteDailyFluctuationOperator, bulkWriteConcernSettings)
		await this.manufacturingOrderModel.bulkWrite(bulkWriteMasterFluctuationOperator, bulkWriteConcernSettings)

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(
			pendingInventoryFluctuation.map((fluctuation) => {
				for (const size in fluctuation.changes) {
					if (fluctuation.changes.hasOwnProperty(size)) {
						fluctuation.changes[size].stocked_in_qty = -fluctuation.changes[size].stocked_in_qty
						fluctuation.changes[size].total_recall_tx = -fluctuation.changes[size].total_recall_tx
						fluctuation.changes[size].total_return_tx = -fluctuation.changes[size].total_return_tx
					}
				}

				return {
					mo_no: fluctuation.mo_no,
					size_ledger: fluctuation.changes
				}
			})
		)
	}
}
