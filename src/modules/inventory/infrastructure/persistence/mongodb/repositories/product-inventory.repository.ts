import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IProductionInventoryRepository } from '@modules/inventory/application/ports/production-inventory.repository.port'
import { GetProductionInventoryQuery } from '@modules/inventory/application/queries/get-production-inventory/get-production-inventory.query'
import { ManufacturingOrder, ManufacturingOrderModel } from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderModel } from '@modules/order/schemas/purchase-order.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'

@Injectable()
export class ProductInventoryRepository implements IProductionInventoryRepository {
	constructor(
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel
	) {}

	public async getProductionInventory(query: GetProductionInventoryQuery): Promise<any> {
		const [inbound, outbound] = await Promise.all([
			this.getInstockManufacturingOrders(query),
			this.getIncompletePurchaseOrders(query)
		])

		return { inbound, outbound }
	}

	private buildFilterQueries(query: GetProductionInventoryQuery) {
		return MongoQueryBuilder.from({
			brand_name: query.brandName,
			factory_shoes_style: query.shoeStyle,
			color_sn: query.color
		})
			.omitIf('brand_name', (value) => value.brand_name === 'all')
			.omitIf('factory_shoes_style', (value) => value.factory_shoes_style === 'all')
			.omitIf('color_sn', (value) => value.color_sn === 'all')
			.build()
	}

	private async getInstockManufacturingOrders(query: GetProductionInventoryQuery) {
		const filterQueries = this.buildFilterQueries(query)

		return await this.manufacturingOrderModel.aggregate([
			{
				$match: filterQueries
			},
			{
				$addFields: {
					size_items: { $objectToArray: '$size_ledger' }
				}
			},
			{
				$addFields: {
					size_ledger: {
						$map: {
							input: '$size_items',
							as: 's',
							in: {
								size_numcode: '$$s.k',
								qty: {
									$subtract: [
										{
											$add: [
												{ $ifNull: ['$$s.v.stocked_in_qty', 0] },
												{ $ifNull: ['$$s.v.total_return_tx', 0] }
											]
										},
										{
											$add: [
												{ $ifNull: ['$$s.v.shipped_out_qty', 0] },
												{ $ifNull: ['$$s.v.total_recall_tx', 0] }
											]
										}
									]
								}
							}
						}
					}
				}
			},
			{
				$addFields: {
					has_positive_size: {
						$gt: [
							{
								$size: {
									$filter: {
										input: '$size_ledger',
										as: 'x',
										cond: { $gt: ['$$x.qty', 0] }
									}
								}
							},
							0
						]
					},
					instock_qty: {
						$sum: {
							$map: {
								input: '$size_items',
								as: 's',
								in: {
									$subtract: [
										{
											$add: [
												{ $ifNull: ['$$s.v.stocked_in_qty', 0] },
												{ $ifNull: ['$$s.v.total_return_tx', 0] }
											]
										},
										{
											$add: [
												{ $ifNull: ['$$s.v.shipped_out_qty', 0] },
												{ $ifNull: ['$$s.v.total_recall_tx', 0] }
											]
										}
									]
								}
							}
						}
					}
				}
			},
			{
				$match: {
					has_positive_size: true
				}
			},
			{
				$lookup: {
					from: 'daily_mo_inventory_ledger',
					let: { mo: '$mo_no' },
					pipeline: [
						{
							$match: {
								$expr: { $eq: ['$mo_no', '$$mo'] }
							}
						},
						{
							$sort: { date: -1 }
						},
						{
							$limit: 1
						},
						{
							$project: {
								_id: 0,
								last_inbound_time: '$date'
							}
						}
					],
					as: 'last_inbound'
				}
			},
			{
				$addFields: {
					last_inbound_time: {
						$first: '$last_inbound.last_inbound_time'
					}
				}
			},
			{
				$project: {
					_id: 0,
					mo_no: 1,
					last_inbound_time: 1,
					order_qty: 1,
					instock_qty: 1,
					size_ledger: 1
				}
			},
			{
				$match: {
					instock_qty: { $gte: 0 }
				}
			},
			{ $sort: { mo_no: -1 } }
		])
	}

	private async getIncompletePurchaseOrders(query: GetProductionInventoryQuery) {
		const filterQueries = this.buildFilterQueries(query)

		return await this.purchaseOrderModel.aggregate([
			{
				$match: filterQueries
			},

			{
				$addFields: {
					shipping_items: { $objectToArray: '$shipping_progress' }
				}
			},
			{
				$addFields: {
					size_ledger: {
						$map: {
							input: '$shipping_items',
							as: 's',
							in: {
								size_numcode: '$$s.k',
								qty: {
									$subtract: [{ $ifNull: ['$$s.v.order_qty', 0] }, { $ifNull: ['$$s.v.shipped_out_qty', 0] }]
								}
							}
						}
					}
				}
			},
			{
				$addFields: {
					has_unshipped_size: {
						$gt: [
							{
								$size: {
									$filter: {
										input: '$size_ledger',
										as: 'x',
										cond: { $gt: ['$$x.qty', 0] }
									}
								}
							},
							0
						]
					},
					outbound_qty: {
						$sum: {
							$map: {
								input: '$shipping_items',
								as: 's',
								in: {
									$subtract: [{ $ifNull: ['$$s.v.order_qty', 0] }, { $ifNull: ['$$s.v.shipped_out_qty', 0] }]
								}
							}
						}
					}
				}
			},
			{
				$match: {
					has_unshipped_size: true
				}
			},
			{
				$lookup: {
					from: 'daily_po_shipping_progress',
					let: { po: '$po' },
					pipeline: [
						{
							$match: {
								$expr: { $eq: ['$po', '$$po'] }
							}
						},
						{
							$sort: { date: -1 }
						},
						{
							$limit: 1
						},
						{
							$project: {
								_id: 0,
								last_outbound_date: '$date'
							}
						}
					],
					as: 'last_outbound_doc'
				}
			},
			{
				$addFields: {
					last_outbound_date: {
						$first: '$last_outbound_doc.last_outbound_date'
					},
					order_qty: {
						$sum: {
							$map: {
								input: '$shipping_items',
								as: 's',
								in: { $ifNull: ['$$s.v.order_qty', 0] }
							}
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					po: 1,
					last_outbound_date: 1,
					order_qty: 1,
					outbound_qty: 1,
					size_ledger: 1
				}
			}
		])
	}

	private async getInstockSizes(query: GetProductionInventoryQuery) {
		const filterQueries = this.buildFilterQueries(query)

		return await this.manufacturingOrderModel.aggregate([
			{
				$match: filterQueries
			},
			{
				$project: {
					size_ledger_arr: { $objectToArray: '$size_ledger' }
				}
			},
			{ $unwind: '$size_ledger_arr' },
			{
				$project: {
					size_numcode: '$size_ledger_arr.k',
					instock_qty: {
						$subtract: [
							{
								$add: [
									{ $ifNull: ['$size_ledger_arr.v.stocked_in_qty', 0] },
									{ $ifNull: ['$size_ledger_arr.v.total_return_tx', 0] }
								]
							},
							{
								$add: [
									{ $ifNull: ['$size_ledger_arr.v.total_recall_tx', 0] },
									{ $ifNull: ['$size_ledger_arr.v.shipped_out_qty', 0] }
								]
							}
						]
					}
				}
			},
			{
				$group: {
					_id: '$size_numcode',
					instock_qty: { $first: '$instock_qty' }
				}
			},
			{
				$project: {
					_id: 0,
					size_numcode: '$_id',
					instock_qty: 1
				}
			},
			{
				$sort: { size_numcode: 1 }
			}
		])
	}
}
