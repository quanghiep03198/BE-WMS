import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IShippingProgressRepository } from '@modules/finished-goods/application/ports/shipping-progress.repository.port'
import { ExcessOutboundOrderException } from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderModel } from '@modules/order/schemas/purchase-order.schema'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { format } from 'date-fns'
import { type AnyBulkWriteOperation, type FilterQuery, mongo, type MongooseBulkWriteOptions } from 'mongoose'
import {
	DailyPoShippingProgress,
	DailyPoShippingProgressDocument,
	DailyPoShippingProgressModel
} from '../schemas/daily-po-shipping-progress.schema'

type ShippingProgressIncrementKey = `shipping_progress.${string}.shipped_out_qty`

@Injectable()
export class ShippingProgressMongoRepository implements IShippingProgressRepository {
	constructor(
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly poShippingProgress: PurchaseOrderModel,
		@InjectModel(DailyPoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyPoShippingProgressModel: DailyPoShippingProgressModel,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

	private createShippingProgressIncrementExpression(change: {
		mo_no: string
		po: string | null | undefined
		factory_code_produce: string
		factory_shoes_style: string
		color_sn: string
		size_ledger: Record<string, { shipped_out_qty: number }>
	}): Record<ShippingProgressIncrementKey, mongo.NumericType> {
		return Object.entries(change.size_ledger).reduce<Record<ShippingProgressIncrementKey, mongo.NumericType>>(
			(acc, [size, fluctuation]) => {
				return {
					...acc,
					[`shipping_progress.${size}.shipped_out_qty`]: fluctuation.shipped_out_qty
				}
			},
			{}
		)
	}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async getPendingShippingFluctuation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			size_ledger: Record<string, { shipped_out_qty: number }>
		}>
	> {
		return []
	}

	public async getPoOutboundProgress(
		purchaseOrder: string
	): Promise<Array<{ size_numcode: string; order_qty: number; accumulated_qty: number }>> {
		const poShippingProgress = await this.poShippingProgress.findOne({ po: purchaseOrder }).lean(true)

		if (!poShippingProgress) return []

		return Object.entries(poShippingProgress.shipping_progress).map(([size, balances]) => {
			const { order_qty, shipped_out_qty } = balances
			return {
				size_numcode: size,
				order_qty,
				accumulated_qty: shipped_out_qty
			}
		})
	}

	public async applyShippingProgressForStockOut(
		transactionId: string,
		pendingInventoryFluctuation: Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			size_ledger: Record<string, { shipped_out_qty: number }>
		}>
	): Promise<void> {
		const progressByPo = new Map<
			string,
			{
				source: (typeof pendingInventoryFluctuation)[number]
				size_ledger: Record<string, { shipped_out_qty: number }>
			}
		>()
		for (const change of pendingInventoryFluctuation) {
			if (!change.po) throw new ExcessOutboundOrderException('Stock-out requires a purchase order')

			let progress = progressByPo.get(change.po)
			if (!progress) {
				progress = { source: change, size_ledger: {} }
				progressByPo.set(change.po, progress)
			}

			for (const [size, fluctuation] of Object.entries(change.size_ledger)) {
				progress.size_ledger[size] = {
					shipped_out_qty: (progress.size_ledger[size]?.shipped_out_qty ?? 0) + fluctuation.shipped_out_qty
				}
			}
		}

		for (const [po, progress] of progressByPo) {
			const conditions = Object.entries(progress.size_ledger).map(([size, fluctuation]) => {
				const sizePath = `$shipping_progress.${size}`
				return {
					$lte: [
						{
							$add: [{ $ifNull: [`${sizePath}.shipped_out_qty`, 0] }, fluctuation.shipped_out_qty]
						},
						`${sizePath}.order_qty`
					]
				}
			})
			const filter = {
				po,
				$expr: { $and: conditions }
			} as FilterQuery<PurchaseOrderDocument>
			const incrementExpression = this.createShippingProgressIncrementExpression({
				...progress.source,
				size_ledger: progress.size_ledger
			})
			const result = await this.poShippingProgress.updateOne(
				filter,
				{ $inc: incrementExpression },
				{ session: this.txHost.tx }
			)

			if (result.matchedCount !== 1)
				throw new ExcessOutboundOrderException('Outbound order exceeded the persisted purchase-order limit')
		}

		const date = format(new Date(), 'yyyy-MM-dd')

		const bulkWriteOptions: mongo.BulkWriteOptions & MongooseBulkWriteOptions = {
			session: this.txHost.tx,
			ordered: false,
			timestamps: true
		}

		const dailyShippingBulkWriteOperator: AnyBulkWriteOperation<DailyPoShippingProgressDocument>[] =
			pendingInventoryFluctuation.map((change) => {
				const incrementExpression = Object.entries(change.size_ledger).reduce((acc, [size, fluctuation]) => {
					return {
						...acc,
						[`shipping_progress.${change.mo_no}.${size}`]: fluctuation.shipped_out_qty
					}
				}, {})

				const transactionHistory = Object.entries(change.size_ledger).reduce((acc, [size, fluctuation]) => {
					return {
						...acc,
						[`transaction_history.${transactionId}.packing.${change.mo_no}.${size}`]: fluctuation.shipped_out_qty
					}
				}, {})

				return {
					updateOne: {
						filter: { po: change.po, date },
						update: {
							$setOnInsert: { po: change.po, date },
							$inc: incrementExpression,
							$set: {
								[`transaction_history.${transactionId}.time`]: format(new Date(), 'HH:mm'),
								[`transaction_history.${transactionId}.voided`]: false,
								...transactionHistory
							}
						},
						upsert: true
					}
				}
			})

		await this.dailyPoShippingProgressModel.bulkWrite(dailyShippingBulkWriteOperator, bulkWriteOptions)
	}
}
