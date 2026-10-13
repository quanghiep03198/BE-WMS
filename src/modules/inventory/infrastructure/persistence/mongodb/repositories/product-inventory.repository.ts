import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IProductionInventoryRepository } from '@modules/inventory/application/ports/production-inventory.repository.port'
import { GetProductionInventoryQuery } from '@modules/inventory/application/queries/get-production-inventory/get-production-inventory.query'
import { ManufacturingOrder, ManufacturingOrderModel } from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderModel } from '@modules/order/schemas/purchase-order.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import isEmpty from 'lodash/isEmpty'
import isNil from 'lodash/isNil'

@Injectable()
export class ProductInventoryRepository implements IProductionInventoryRepository {
	constructor(
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel
	) {}

	public async getProductionInventory(query: GetProductionInventoryQuery) {
		const [inbound, outbound, sizes] = await Promise.all([
			this.getInstockManufacturingOrders(query),
			this.getIncompletePurchaseOrders(query),
			this.getInstockSizes(query)
		])

		return { inbound, outbound, sizes }
	}

	private buildFilterQueries(query: GetProductionInventoryQuery) {
		return MongoQueryBuilder.from({
			brand_name: query.brandName,
			factory_shoes_style: query.shoeStyle,
			color_sn: query.color
		})
			.omitIf('brand_name', (value) => isNil(value.brand_name) || isEmpty(value.brand_name))
			.omitIf(
				'factory_shoes_style',
				(value) => isNil(value.factory_shoes_style) || isEmpty(value.factory_shoes_style)
			)
			.omitIf('color_sn', (value) => isNil(value.color_sn) || isEmpty(value.color_sn))
			.build()
	}

	private async getInstockManufacturingOrders(query: GetProductionInventoryQuery) {
		const filterQueries = this.buildFilterQueries(query)

		return await this.manufacturingOrderModel.aggregate<{
			mo_no: string
			last_inbound_date?: Date
			order_qty: number
			instock_qty: number
			size_ledger: Array<{ size_numcode: string; qty: number }>
		}>([
			{ $match: filterQueries },
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
								last_inbound_date: '$date'
							}
						}
					],
					as: 'last_inbound'
				}
			},
			{
				$addFields: {
					last_inbound_date: {
						$first: '$last_inbound.last_inbound_date'
					}
				}
			},
			{
				$project: {
					_id: 0,
					mo_no: 1,
					last_inbound_date: 1,
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

		return await this.purchaseOrderModel.aggregate<{
			po: string
			order_qty: number
			outbound_qty: number
			last_outbound_date: Date
			size_ledger: Array<{ size_numcode: string; qty: number }>
		}>([
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

		return await this.manufacturingOrderModel.aggregate<{ size_numcode: string; qty: number }>([
			{
				$match: { ...filterQueries, brand_name: 'UGG' }
			},
			{
				$project: {
					sizeArray: { $objectToArray: '$size_ledger' }
				}
			},
			{
				$unwind: '$sizeArray'
			},
			{
				$project: {
					size: '$sizeArray.k',
					stock: {
						$subtract: [
							{
								$add: ['$sizeArray.v.stocked_in_qty', '$sizeArray.v.total_return_tx']
							},
							{
								$add: ['$sizeArray.v.total_recall_tx', '$sizeArray.v.shipped_out_qty']
							}
						]
					}
				}
			},
			{
				$group: {
					_id: '$size',
					qty: { $sum: '$stock' }
				}
			},
			{
				$project: {
					_id: 0,
					size_numcode: '$_id',
					qty: 1
				}
			},
			{
				$sort: { size: 1 }
			}
		])
	}
}
