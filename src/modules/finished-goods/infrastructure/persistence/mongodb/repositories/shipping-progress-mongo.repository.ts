import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IShippingProgressMongoRepository } from '@modules/finished-goods/application/ports/shipping-progress-mongo.repository.port'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { format } from 'date-fns'
import { AnyBulkWriteOperation, mongo } from 'mongoose'

import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import {
	DailyPoShippingProgress,
	DailyPoShippingProgressDocument,
	DailyPoShippingProgressModel
} from '../schemas/daily-po-shipping-progress.schema'
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderModel } from '../schemas/purchase-order.schema'

type ShippingProgressIncrementKey = `shipping_progress.${string}.shipped_out_qty`

type InventoryVariationAsync = Awaited<
	ReturnType<ShippingProgressMongoRepository['getPendingShippingVariation']>
>[number]

@Injectable()
export class ShippingProgressMongoRepository implements IShippingProgressMongoRepository {
	constructor(
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly poShippingProgress: PurchaseOrderModel,
		@InjectModel(DailyPoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyPoShippingProgressModel: DailyPoShippingProgressModel,
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>
	) {}

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

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	public async getPendingShippingVariation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<string, { shipped_out_qty: number }>
		}>
	> {
		return [] as any
	}

	public async getPoOutboundProgress(
		purchaseOrder: string
	): Promise<Array<{ size_numcode: string; order_qty: number; accumulated_qty: number }>> {
		const poShippingProgress = await this.poShippingProgress.findOne({ po: purchaseOrder }).lean(true)

		if (!poShippingProgress) return []

		return Object.entries(poShippingProgress.shipping_progress).map(([size, variation]) => {
			const { order_qty, shipped_out_qty } = variation as any
			return {
				size_numcode: size,
				order_qty,
				accumulated_qty: shipped_out_qty
			}
		})
	}

	public async applyShippingProgressForStockOut(
		pendingInventoryVariation: Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<string, { shipped_out_qty: number }>
		}>
	): Promise<void> {
		const poShippingProgressBulkWriteOperator: AnyBulkWriteOperation<PurchaseOrderDocument>[] =
			pendingInventoryVariation.map((change) => {
				return {
					updateOne: {
						filter: { po: change.po },
						update: { $inc: this.createShippingProgressIncrementExpression(change as any) }
					}
				}
			})

		await this.poShippingProgress.bulkWrite(poShippingProgressBulkWriteOperator, {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		})

		const date = format(new Date(), 'yyyy-MM-dd')
		const dailyShippingBulkWriteOperator: AnyBulkWriteOperation<DailyPoShippingProgressDocument>[] =
			pendingInventoryVariation.map((change) => {
				const incrementExpression = Object.entries(change.inventory_variation).reduce((acc, [size, variation]) => {
					return {
						...acc,
						[`shipping_progress.${change.mo_no}.${size}`]: variation.shipped_out_qty
					}
				}, {})

				return {
					updateOne: {
						filter: { po: change.po, date },
						update: {
							$setOnInsert: { po: change.po, date },
							$inc: incrementExpression
						},
						upsert: true
					}
				}
			})

		await this.dailyPoShippingProgressModel.bulkWrite(dailyShippingBulkWriteOperator, {
			session: this.txHost.tx,
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
