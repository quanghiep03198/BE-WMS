import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	IInventoryLedgerMongoRepository,
	IPendingInventoryFluctuation
} from '@modules/finished-goods/application/ports/inventory-ledger-mongo.repository.port'
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
} from '@modules/inventory/application/ports/inventory-audit.repository.port'
import { InjectTransactionHost, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { format } from 'date-fns'
import { AnyBulkWriteOperation, MongooseBulkWriteOptions } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DailyMoInventoryLedger, DailyMoInventoryLedgerModel } from '../schemas/daily-mo-inventory-ledger.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcModel } from '../schemas/finished-goods-epc.schema'
import {
	ManufacturingOrder,
	ManufacturingOrderDocument,
	ManufacturingOrderModel
} from '../schemas/manufacturing-order.schema'

type InventoryFluctuationIncrementKey =
	`size_ledger.${string}.${'stocked_in_qty' | 'total_recall_tx' | 'total_return_tx' | 'shipped_out_qty'}`

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
		change: IPendingInventoryFluctuation | Pick<IPendingInventoryFluctuation, 'mo_no' | 'size_ledger'>
	): Record<InventoryFluctuationIncrementKey, mongo.NumericType> {
		return flatten<
			Pick<IPendingInventoryFluctuation, 'size_ledger'>,
			Record<InventoryFluctuationIncrementKey, mongo.NumericType>
		>(pick(change, 'size_ledger'))
	}

	private createInventoryDecrementExpression(
		change: IPendingInventoryFluctuation | Pick<IPendingInventoryFluctuation, 'mo_no' | 'size_ledger'>
	): Record<InventoryFluctuationIncrementKey, mongo.NumericType> {
		const decrementExpression = flatten<
			Pick<IPendingInventoryFluctuation, 'size_ledger'>,
			Record<InventoryFluctuationIncrementKey, mongo.NumericType>
		>(pick(change, 'size_ledger'))
		for (const field in decrementExpression) {
			if (decrementExpression.hasOwnProperty(field) && decrementExpression[field] !== 0)
				decrementExpression[field] = -decrementExpression[field]
		}
		return decrementExpression
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

		return aggregated.length === 1 ? aggregated[0] : aggregated
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

		await this.dailyMoInventoryLedgerModel.updateOne(
			pick(pendingInventoryFluctuation, ['mo_no', 'factory_code_produce', 'factory_shoes_style', 'color_sn']),
			{
				$setOnInsert: { mo_no: pendingInventoryFluctuation.mo_no, date: format(new Date(), 'yyyy-MM-dd') },
				$inc: omitBy(incrementExpression, (_, key) => key.endsWith('shipped_out_qty')),
				[`transaction_history.${transactionId}`]: {
					time: format(new Date(), 'HH:mm'),
					assembly_line: pendingStockInEpcs.at(0).getAssemblyLine('name', 'sanitized'),
					storage_location: pendingStockInEpcs.at(0).getStorageLocation('name'),
					size_ledger: txSizeLedger,
					reversed: false
				}
			},
			{ upsert: true, session: this.txHost.tx }
		)
		await this.manufacturingOrderModel.updateOne(
			pick(pendingInventoryFluctuation, ['mo_no', 'factory_code_produce', 'factory_shoes_style', 'color_sn']),
			{ $inc: incrementExpression },
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
			retryWrites: true,
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
			}
		)

		await this.manufacturingOrderModel.updateOne(bulkWriteMasterFluctuationOperator, bulkWriteConcernSettings)
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

		await this.dailyMoInventoryLedgerModel.updateOne(
			{ mo_no: pendingInventoryFluctuation.mo_no, date },
			{
				$setOnInsert: { date, mo_no: pendingInventoryFluctuation.mo_no },
				$inc: incrementExpression,
				[`transaction_history.${transactionId}`]: {
					date,
					time: format(new Date(), 'HH:mm'),
					size_ledger: txSizeLedger,
					reversed: false
				}
			},
			{ session: this.txHost.tx, upsert: true }
		)

		await this.manufacturingOrderModel.updateOne(
			pick(pendingInventoryFluctuation, ['mo_no', 'factory_code_produce', 'factory_shoes_style', 'color_sn']),
			{ $inc: pickBy(incrementExpression, (_, key) => key.endsWith('total_recall_tx')) },
			{ session: this.txHost.tx }
		)

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation(pendingInventoryFluctuation)

		return pendingInventoryFluctuation
	}

	async rollbackInboundFluctuation({ id, mo_no, changes, tx_type }: IStockTransaction<'inbound'>) {
		const decrementExpression = omitBy(
			this.createInventoryDecrementExpression({
				mo_no,
				size_ledger: changes
			}),
			(_, key) => key.endsWith('shipped_out_qty')
		)

		for (const expr in decrementExpression) {
			const size = expr.split('.').at(1)

			// * Rollback "Recall" transaction thì giữ nguyên số lượng thu hồi và tăng số lượng trả về (coi như quét lại lần 2)
			if (tx_type === 'recall') {
				if (expr.endsWith('total_recall_tx')) decrementExpression[expr] = 0
				if (expr.endsWith('total_return_tx'))
					decrementExpression[expr] = Math.abs(changes[size]?.total_recall_tx ?? 0)
			}
			// * Rollback "Stock In" transaction thì giữ nguyên số lượng nhập kho và tăng số lượng trả về (coi như quét lại lần 2)
			if (tx_type === 'stock_in') {
				if (expr.endsWith('stocked_in_qty')) decrementExpression[expr] = 0
				if (expr.endsWith('total_return_tx'))
					decrementExpression[expr] = Math.abs(changes[size].total_return_tx || changes[size].stocked_in_qty)
			}
		}

		await this.dailyMoInventoryLedgerModel.updateOne(
			{ mo_no, date: format(new Date(), 'yyyy-MM-dd') },
			{ [`transaction_history.${id}.reversed`]: true },
			{ session: this.txHost.tx }
		)

		await this.manufacturingOrderModel.updateOne(
			{ mo_no },
			{ $inc: decrementExpression },
			{ session: this.txHost.tx }
		)

		const sizeLedger = { ...changes }

		for (const size in sizeLedger) {
			delete changes[size].shipped_out_qty

			changes[size].stocked_in_qty = -1 * changes[size].stocked_in_qty
			changes[size].total_recall_tx = -1 * changes[size].total_recall_tx
			changes[size].total_return_tx = -1 * changes[size].total_return_tx
		}

		await this.inventoryAuditRepository.updateInventoryAuditFluctuation({ mo_no, size_ledger: sizeLedger })
	}
}
