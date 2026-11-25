import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	IInventoryLedgerRepository,
	IPendingInventoryFluctuation
} from '@modules/finished-goods/application/ports/inventory-ledger.repository.port'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ExcessInboundOrderException } from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { InsufficientInventoryException } from '@modules/finished-goods/domain/exceptions/insufficient-inventory.exception'
import { StockTransactionNotRollbackableException } from '@modules/finished-goods/domain/exceptions/stock-transaction-not-rollbackable.exception'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { flatten, unflatten } from 'flat'
import { omitBy, pick, pickBy } from 'lodash'
import { mongo, type FilterQuery } from 'mongoose'

import { IInoutboundTransaction } from '@modules/finished-goods/application/types'
import {
	IInventoryAuditRepository,
	INVENTORY_AUDIT_REPOSITORY
} from '@modules/inventory/application/ports/inventory-audit.repository.port'
import {
	ManufacturingOrder,
	ManufacturingOrderDocument,
	ManufacturingOrderModel
} from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderModel } from '@modules/order/schemas/purchase-order.schema'
import { InjectTransactionHost, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { format } from 'date-fns'
import { AnyBulkWriteOperation, MongooseBulkWriteOptions } from 'mongoose'
import { DailyMoInventoryLedger, DailyMoInventoryLedgerModel } from '../schemas/daily-mo-inventory-ledger.schema'
import { DailyPoShippingProgress, DailyPoShippingProgressModel } from '../schemas/daily-po-shipping-progress.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'

type InventoryFluctuationIncrementKey =
	`size_ledger.${string}.${'stocked_in_qty' | 'total_recall_tx' | 'total_return_tx' | 'shipped_out_qty'}`

@Injectable()
export class InventoryLedgerRepository implements IInventoryLedgerRepository {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(DailyMoInventoryLedger.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryLedgerModel: DailyMoInventoryLedgerModel,
		@InjectModel(DailyPoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyPoShippingProgressModel: DailyPoShippingProgressModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel,
		@Inject(INVENTORY_AUDIT_REPOSITORY)
		private readonly inventoryAuditRepository: IInventoryAuditRepository,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	private createInventoryIncrementExpression(
		change: IPendingInventoryFluctuation | Pick<IPendingInventoryFluctuation, 'mo_no' | 'size_ledger'>
	): Record<InventoryFluctuationIncrementKey, mongo.NumericType> {
		return flatten<
			Pick<IPendingInventoryFluctuation, 'size_ledger'>,
			Record<InventoryFluctuationIncrementKey, mongo.NumericType>
		>(pick(change, 'size_ledger'))
	}

	private createInventoryDecrementExpression(
		change: IPendingInventoryFluctuation | { size_ledger: Partial<Pick<IPendingInventoryFluctuation, 'size_ledger'>> }
	): Record<InventoryFluctuationIncrementKey, mongo.NumericType> {
		const decrementExpression = flatten<
			IPendingInventoryFluctuation | { size_ledger: Partial<Pick<IPendingInventoryFluctuation, 'size_ledger'>> },
			Record<InventoryFluctuationIncrementKey, mongo.NumericType>
		>(pick(change, 'size_ledger'))
		for (const field in decrementExpression) {
			if (field in decrementExpression && decrementExpression[field] !== 0)
				decrementExpression[field] = -decrementExpression[field]
		}
		return decrementExpression
	}

	private createManufacturingOrderQuantityConditions(
		delta: Record<InventoryFluctuationIncrementKey, mongo.NumericType>
	) {
		const sizes = new Set(Object.keys(delta).map((path) => path.split('.')[1]))
		return Array.from(sizes, (size) => {
			const sizePath = `size_ledger.${size}` as const
			const after = (field: 'stocked_in_qty' | 'total_return_tx' | 'total_recall_tx' | 'shipped_out_qty') => {
				const path = `${sizePath}.${field}` as const
				return { $add: [{ $ifNull: [`$${path}`, 0] }, delta[path] ?? 0] }
			}
			const effectiveInbound = {
				$subtract: [{ $add: [after('stocked_in_qty'), after('total_return_tx')] }, after('total_recall_tx')]
			}
			const shippedOut = after('shipped_out_qty')
			const orderQty = `$${sizePath}.order_qty`
			return {
				$and: [
					{ $isNumber: orderQty },
					{ $gte: [shippedOut, 0] },
					{ $lte: [shippedOut, effectiveInbound] },
					{ $lte: [effectiveInbound, orderQty] }
				]
			}
		})
	}

	private createManufacturingOrderGuardFilter(
		change: IPendingInventoryFluctuation,
		delta: Record<InventoryFluctuationIncrementKey, mongo.NumericType>
	): FilterQuery<ManufacturingOrderDocument> {
		return {
			mo_no: change.mo_no,
			factory_code_produce: change.factory_code_produce,
			factory_shoes_style: change.factory_shoes_style,
			color_sn: change.color_sn,
			$expr: { $and: this.createManufacturingOrderQuantityConditions(delta) }
		}
	}

	public async getPendingInventoryFluctuation(
		scannedEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation | Array<IPendingInventoryFluctuation>> {
		const aggregated = await this.finishedGoodsEpcModel
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
						po: {
							$cond: {
								if: { $eq: ['$po', null] },
								then: '$$REMOVE',
								else: '$po'
							}
						},
						factory_code_produce: '$_id.factory_code_produce',
						factory_shoes_style: '$_id.factory_shoes_style',
						color_sn: '$_id.color_sn',
						size_ledger: { $arrayToObject: '$size_ledger' }
					}
				}
			])
			.read('primary')
			.session(this.txHost.tx)

		return aggregated.length === 1 ? aggregated[0] : aggregated
	}

	public async commitInventoryLedgerOnStockIn(
		transactionId: string,
		pendingStockInEpcs: Array<ElectronicProductCode>
	) {
		const pendingInventoryFluctuation = (await this.getPendingInventoryFluctuation(
			pendingStockInEpcs
		)) as IPendingInventoryFluctuation
		const incrementExpression = this.createInventoryIncrementExpression(pendingInventoryFluctuation)
		const txSizeLedger = pendingInventoryFluctuation.size_ledger
		for (const size in txSizeLedger) {
			delete txSizeLedger[size].shipped_out_qty
		}
		const inventoryUpdate = await this.manufacturingOrderModel.updateOne(
			this.createManufacturingOrderGuardFilter(pendingInventoryFluctuation, incrementExpression),
			{ $inc: incrementExpression },
			{ session: this.txHost.tx }
		)
		if (inventoryUpdate.matchedCount !== 1)
			throw new ExcessInboundOrderException('Inbound order exceeded the persisted manufacturing-order limit')

		const date = format(new Date(), 'yyyy-MM-dd')

		await this.dailyMoInventoryLedgerModel.updateOne(
			{ date, mo_no: pendingInventoryFluctuation.mo_no },
			{
				$setOnInsert: { mo_no: pendingInventoryFluctuation.mo_no, date },
				$inc: omitBy(incrementExpression, (_, key) => key.endsWith('shipped_out_qty')),
				[`transaction_history.${transactionId}`]: {
					time: format(new Date(), 'HH:mm'),
					tx_type: 'stock_in',
					assembly_line: pendingStockInEpcs.at(0).getAssemblyLine('id'),
					storage_location: pendingStockInEpcs.at(0).getStorageLocation('id'),
					size_ledger: txSizeLedger,
					voided: false
				}
			},
			{ upsert: true, session: this.txHost.tx }
		)
		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(pendingInventoryFluctuation)
		return pendingInventoryFluctuation
	}

	public async commitInventoryLedgerOnStockOut(
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation[]> {
		const bulkWriteConcernSettings: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			timestamps: true
		}

		const pendingInventoryFluctuation = await this.getPendingInventoryFluctuation(pendingShipOutEpcs)

		const fluctuation = Array.isArray(pendingInventoryFluctuation)
			? pendingInventoryFluctuation
			: [pendingInventoryFluctuation]

		const bulkWriteMasterFluctuationOperator: AnyBulkWriteOperation<ManufacturingOrderDocument>[] = fluctuation.map(
			(mo) => {
				const incrementExpression = pickBy(this.createInventoryIncrementExpression(mo), (_, key) => {
					return key.endsWith('shipped_out_qty')
				})
				return {
					updateOne: {
						filter: this.createManufacturingOrderGuardFilter(mo, incrementExpression),
						update: {
							$inc: incrementExpression
						}
					}
				}
			}
		)

		const inventoryUpdate = await this.manufacturingOrderModel.bulkWrite(
			bulkWriteMasterFluctuationOperator,
			bulkWriteConcernSettings
		)
		if (inventoryUpdate.matchedCount !== fluctuation.length)
			throw new InsufficientInventoryException('Insufficient manufacturing-order inventory for ship-out')

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(fluctuation)

		return fluctuation
	}

	public async commitInventoryLedgerOnRecall(
		transactionId: string,
		pendingRecallEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation> {
		const pendingInventoryFluctuation = (await this.getPendingInventoryFluctuation(
			pendingRecallEpcs
		)) as IPendingInventoryFluctuation

		const date = format(new Date(), 'yyyy-MM-dd')

		const incrementExpression = this.createInventoryIncrementExpression(pendingInventoryFluctuation)
		const txSizeLedger = { ...pendingInventoryFluctuation.size_ledger }

		for (const size in txSizeLedger) {
			delete txSizeLedger[size].shipped_out_qty
		}

		const recallIncrement = pickBy(incrementExpression, (_, key) => key.endsWith('total_recall_tx'))
		const inventoryUpdate = await this.manufacturingOrderModel.updateOne(
			this.createManufacturingOrderGuardFilter(pendingInventoryFluctuation, recallIncrement),
			{ $inc: recallIncrement },
			{ session: this.txHost.tx }
		)
		if (inventoryUpdate.matchedCount !== 1)
			throw new InsufficientInventoryException('Insufficient manufacturing-order inventory for recall')

		await this.dailyMoInventoryLedgerModel.updateOne(
			{ mo_no: pendingInventoryFluctuation.mo_no, date },
			{
				$setOnInsert: { date, mo_no: pendingInventoryFluctuation.mo_no },
				$inc: incrementExpression,
				[`transaction_history.${transactionId}`]: {
					date,
					time: format(new Date(), 'HH:mm'),
					tx_type: 'recall',
					size_ledger: txSizeLedger,
					voided: false
				}
			},
			{ session: this.txHost.tx, upsert: true }
		)

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(pendingInventoryFluctuation)

		return pendingInventoryFluctuation
	}

	async getInboundTransactionHistory(
		transactionId: string
	): Promise<(IInoutboundTransaction<'inbound'> & { date: string }) | undefined> {
		const ledger = await this.dailyMoInventoryLedgerModel
			.findOne({ [`transaction_history.${transactionId}`]: { $exists: true } })
			.read('primary')
			.session(this.txHost.tx)
			.exec()
		if (!ledger) return undefined

		const history = ledger.transaction_history.get(transactionId)
		if (!history) return undefined

		const changes = Object.fromEntries(
			Array.from(history.size_ledger, ([size, fluctuation]) => [
				size,
				{
					stocked_in_qty: fluctuation.stocked_in_qty ?? 0,
					total_recall_tx: fluctuation.total_recall_tx ?? 0,
					total_return_tx: fluctuation.total_return_tx ?? 0,
					shipped_out_qty: 0
				}
			])
		)
		const tx_type =
			history.tx_type ??
			(Object.values(changes).some((size) => size.stocked_in_qty > 0 || size.total_return_tx > 0)
				? 'stock_in'
				: 'recall')
		const qty = Object.values(changes).reduce(
			(sum, size) =>
				sum + (tx_type === 'stock_in' ? size.stocked_in_qty + size.total_return_tx : size.total_recall_tx),
			0
		)

		return {
			id: transactionId,
			mo_no: ledger.mo_no,
			qty,
			tx_at: `${ledger.date} ${history.time}:00`,
			tx_type,
			changes,
			voided: history.voided ?? false,
			date: ledger.date
		}
	}

	async getOutboundTransactionHistory(
		transactionId: string
	): Promise<(IInoutboundTransaction<'outbound'> & { date: string }) | undefined> {
		const ledger = await this.dailyPoShippingProgressModel
			.findOne({ [`transaction_history.${transactionId}`]: { $exists: true } })
			.read('primary')
			.session(this.txHost.tx)
			.exec()
		if (!ledger) return undefined

		const history = ledger.transaction_history.get(transactionId)
		if (!history) return undefined

		const changes = Object.entries(history.packing).map(([mo_no, packing]) => ({
			mo_no,
			size_ledger: Object.fromEntries(
				Object.entries(packing).map(([size, shipped_out_qty]) => [size, { shipped_out_qty }])
			)
		}))
		const qty = changes.reduce(
			(sum, change) =>
				sum + Object.values(change.size_ledger).reduce((sizeSum, item) => sizeSum + item.shipped_out_qty, 0),
			0
		)

		return {
			id: transactionId,
			po: ledger.po,
			qty,
			tx_at: `${ledger.date} ${history.time}:00`,
			tx_type: 'stock_out',
			changes,
			voided: history.voided ?? false,
			date: ledger.date
		}
	}

	private createRollbackCounterConditions(
		decrementExpression: Record<string, mongo.NumericType>
	): Array<Record<string, unknown>> {
		return Object.entries(decrementExpression).map(([path, decrement]) => ({
			$gte: [{ $ifNull: [`$${path}`, 0] }, -Number(decrement)]
		}))
	}

	async rollbackInboundFluctuation({ id, mo_no, changes, tx_at }: IInoutboundTransaction<'inbound'>) {
		const decrementExpression = this.createInventoryDecrementExpression({
			mo_no,
			size_ledger: changes
		})
		const date = tx_at.slice(0, 10)
		const decrementConditions = this.createRollbackCounterConditions(decrementExpression)

		const dailyLedgerUpdate = await this.dailyMoInventoryLedgerModel.updateOne(
			{
				mo_no,
				date,
				[`transaction_history.${id}`]: { $exists: true },
				[`transaction_history.${id}.voided`]: { $ne: true },
				$expr: { $and: decrementConditions }
			},
			{ $inc: decrementExpression, $set: { [`transaction_history.${id}.voided`]: true } },
			{ session: this.txHost.tx }
		)
		if (dailyLedgerUpdate.matchedCount !== 1)
			throw new StockTransactionNotRollbackableException('Inbound transaction counters are no longer rollbackable')

		const manufacturingOrderUpdate = await this.manufacturingOrderModel.updateOne(
			{
				mo_no,
				$expr: {
					$and: [...decrementConditions, ...this.createManufacturingOrderQuantityConditions(decrementExpression)]
				}
			},
			{ $inc: decrementExpression },
			{ session: this.txHost.tx }
		)
		if (manufacturingOrderUpdate.matchedCount !== 1)
			throw new StockTransactionNotRollbackableException('Manufacturing-order counters are no longer rollbackable')

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation({
			mo_no,
			...unflatten(decrementExpression, { object: true })
		})
	}

	public async rollbackOutboundFluctuation({ id, po, changes, tx_at }: IInoutboundTransaction<'outbound'>) {
		const date = tx_at.slice(0, 10)
		const decrementExpressionMap = new Map(
			changes.map((change) => [
				change.mo_no,

				this.createInventoryDecrementExpression({
					mo_no: change.mo_no,
					size_ledger: change.size_ledger
				})
			])
		)

		const dailyDecrementExpression = changes.reduce<Record<string, mongo.NumericType>>((acc, change) => {
			for (const [size, { shipped_out_qty }] of Object.entries(change.size_ledger))
				acc[`shipping_progress.${change.mo_no}.${size}`] =
					Number(acc[`shipping_progress.${change.mo_no}.${size}`] ?? 0) - shipped_out_qty
			return acc
		}, {})
		const dailyConditions = Object.entries(dailyDecrementExpression).map(([path, decrement]) => ({
			$gte: [{ $ifNull: [`$${path}`, 0] }, -Number(decrement)]
		}))
		const dailyLedgerUpdate = await this.dailyPoShippingProgressModel.updateOne(
			{
				po,
				date,
				[`transaction_history.${id}`]: { $exists: true },
				[`transaction_history.${id}.voided`]: { $ne: true },
				$expr: { $and: dailyConditions }
			},
			{ $inc: dailyDecrementExpression, $set: { [`transaction_history.${id}.voided`]: true } },
			{ session: this.txHost.tx }
		)
		if (dailyLedgerUpdate.matchedCount !== 1)
			throw new StockTransactionNotRollbackableException('Outbound transaction history is no longer rollbackable')

		const purchaseOrderDecrementExpression = changes.reduce<Record<string, mongo.NumericType>>((acc, change) => {
			for (const [size, { shipped_out_qty }] of Object.entries(change.size_ledger))
				acc[`shipping_progress.${size}.shipped_out_qty`] =
					Number(acc[`shipping_progress.${size}.shipped_out_qty`] ?? 0) - shipped_out_qty
			return acc
		}, {})
		const purchaseOrderConditions = Object.entries(purchaseOrderDecrementExpression).map(([path, decrement]) => ({
			$gte: [{ $ifNull: [`$${path}`, 0] }, -Number(decrement)]
		}))
		const purchaseOrderUpdate = await this.purchaseOrderModel.updateOne(
			{ po, $expr: { $and: purchaseOrderConditions } },
			{ $inc: purchaseOrderDecrementExpression },
			{ session: this.txHost.tx }
		)
		if (purchaseOrderUpdate.matchedCount !== 1)
			throw new StockTransactionNotRollbackableException('Purchase-order counters are no longer rollbackable')

		const manufacturingOrderUpdates = await this.manufacturingOrderModel.bulkWrite(
			Array.from(decrementExpressionMap, ([manufacturingOrder, decrementExpression]) => ({
				updateOne: {
					filter: {
						mo_no: manufacturingOrder,
						$expr: {
							$and: [
								...this.createRollbackCounterConditions(decrementExpression),
								...this.createManufacturingOrderQuantityConditions(decrementExpression)
							]
						}
					},
					update: { $inc: decrementExpression }
				}
			})),
			{ session: this.txHost.tx, ordered: false }
		)
		if (manufacturingOrderUpdates.matchedCount !== decrementExpressionMap.size)
			throw new StockTransactionNotRollbackableException('Manufacturing-order counters are no longer rollbackable')

		await Promise.all(
			Array.from(decrementExpressionMap, async ([manufacturingOrder, decrementExpression]) => {
				await this.inventoryAuditRepository.updateInventoryAuditFluctuation({
					mo_no: manufacturingOrder,
					...unflatten(decrementExpression, { object: true })
				})
			})
		)
	}
}
