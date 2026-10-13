import { SuperJson } from '@common/utils'
import { DATA_SOURCE_ERP, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { LeanDocument, mongo } from 'mongoose'
import { DataSource } from 'typeorm'
import { IOrderRepository } from './order.repository.interface'
import {
	ManufacturingOrder,
	ManufacturingOrderDocument,
	ManufacturingOrderModel
} from './schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderModel } from './schemas/purchase-order.schema'
import moSizeRunQuery from './sql/manufacturing-order.sql'
import { SizeRun, TManufacturingOrder } from './types'
@Injectable()
export class OrderRepository implements IOrderRepository {
	constructor(
		@InjectDataSource(DATA_SOURCE_ERP)
		private readonly dataSourceERP: DataSource,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel
	) {}

	public async getOneRawManufacturingOrder(targetMo: string, moSeq: string = '001'): Promise<TManufacturingOrder> {
		const [result] = await this.dataSourceERP
			.query<Array<TManufacturingOrder & { sizes: string }>>(moSizeRunQuery, [targetMo, moSeq])
			.then((records) =>
				records.map((record) => ({
					...record,
					sizes: SuperJson.parse<Array<SizeRun>>(record.sizes)
				}))
			)

		return result
	}

	public async getOneManufacturingOrder(manufacturingOrder: string): Promise<ManufacturingOrderDocument> {
		return await this.manufacturingOrderModel
			.findOne({ mo_no: manufacturingOrder })
			.lean<ManufacturingOrderDocument>(true)
	}

	public async searchManufacturingOrder(searchTerm: string): Promise<Array<Record<'mo_no', string>>> {
		return await this.manufacturingOrderModel
			.find({ mo_no: { $regex: searchTerm, $options: 'i' } })
			.select('mo_no')
			.sort({ mo_no: -1 })
			.lean<Array<{ mo_no: string }>>(true)
			.limit(5)
	}

	public async searchPurchaseOrder(
		searchTerm: string,
		shouldFilterAllBrands?: boolean
	): Promise<
		Array<{
			po: string
			order_qty: number
			brand_name: string
			factory_shoes_style: string
			color_sn: string
			is_completed: boolean
		}>
	> {
		{
			const docs = await this.purchaseOrderModel
				.find({
					po: { $regex: searchTerm, $options: 'i' },
					brand_name:
						typeof shouldFilterAllBrands === 'boolean' && shouldFilterAllBrands ? 'UGG' : { $exists: true }
				})
				.lean(true)
				.select('-_id po order_qty brand_name factory_shoes_style color_sn shipping_progress')
				.limit(5)

			return docs.map((doc) => {
				const isCompleted = Object.values(doc.shipping_progress).every(
					(sizeLedger) => sizeLedger.order_qty - sizeLedger.shipped_out_qty === 0
				)

				return {
					po: doc.po,
					order_qty: doc.order_qty,
					brand_name: doc.brand_name,
					factory_shoes_style: doc.factory_shoes_style,
					color_sn: doc.color_sn,
					is_completed: isCompleted
				}
			})
		}
	}

	public async getManufacturingOrderInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>> {
		const data = await this.manufacturingOrderModel
			.findOne({ mo_no: manufacturingOrder })
			.lean(true)
			.read('primary' satisfies mongo.ReadPreferenceMode)

		if (!data) return []

		return Object.entries(data.size_ledger).map(([size, balances]: [string, any]) => {
			const { order_qty, stocked_in_qty, total_recall_tx, total_return_tx, shipped_out_qty } = balances

			return {
				mo_no: data.mo_no,
				size_numcode: size,
				order_qty,
				accumulated_qty: stocked_in_qty - total_recall_tx + total_return_tx - shipped_out_qty
			}
		})
	}

	public async getOnePurchaseOrder(purchaseOrder: string): Promise<LeanDocument<PurchaseOrderDocument>> {
		return await this.purchaseOrderModel
			.findOne({ po_no: purchaseOrder })
			.lean<LeanDocument<PurchaseOrderDocument>>(true)
	}

	public async getPurchaseOrders(purchaseOrders: string[]): Promise<LeanDocument<PurchaseOrderDocument>[]> {
		return await this.purchaseOrderModel
			.find({ po: { $in: purchaseOrders } })
			.lean<LeanDocument<PurchaseOrderDocument>[]>(true)
	}

	public async getPurchaseOrderSnapshots(
		purchaseOrders: string[]
	): Promise<
		Array<Pick<PurchaseOrderDocument, 'po' | 'order_qty' | 'brand_name' | 'factory_shoes_style' | 'color_sn'>>
	> {
		if (purchaseOrders.length === 0) return []
		return await this.purchaseOrderModel
			.find({ po: { $in: purchaseOrders } })
			.select('po order_qty brand_name factory_shoes_style color_sn')
			.lean()
	}
}
