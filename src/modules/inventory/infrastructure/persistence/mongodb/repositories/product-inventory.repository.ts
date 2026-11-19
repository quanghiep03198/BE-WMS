import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IProductionInventoryRepository } from '@modules/inventory/application/ports/production-inventory.repository.port'
import { GetProductionInventoryQuery } from '@modules/inventory/application/queries/get-production-inventory/get-production-inventory.query'
import { ManufacturingOrder, ManufacturingOrderModel } from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderModel } from '@modules/order/schemas/purchase-order.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { format } from 'date-fns'
import isEmpty from 'lodash/isEmpty'
import omit from 'lodash/omit'
import pick from 'lodash/pick'
import type { FilterQuery } from 'mongoose'
import type { MoInventoryAuditDocument } from '../schemas/inventory-audit.schema'
import { MoInventoryAudit, MoInventoryAuditModel } from '../schemas/inventory-audit.schema'

@Injectable()
export class ProductInventoryRepository implements IProductionInventoryRepository {
	constructor(
		@InjectModel(MoInventoryAudit.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryAuditModel: MoInventoryAuditModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel
	) {}

	public async getProductionInventory(query: GetProductionInventoryQuery) {
		const filterQueries = await this.buildFilterQueries(query)

		const [inbound] = await Promise.all([
			this.getInstockManufacturingOrders(query, filterQueries)
			// this.getInstockSizes(filterQueries)
		])

		const sizes: Array<{ size_numcode: string; qty: number }> = Object.entries(
			inbound
				.flatMap((item) => item.size_ledger)
				.reduce<Record<string, number>>((acc, curr) => {
					acc[curr.size_numcode] = (acc[curr.size_numcode] || 0) + curr.qty
					return acc
				}, {})
		).map(([size_numcode, qty]) => ({ size_numcode, qty }))

		return {
			inbound,
			outbound: [],
			sizes
		}
	}

	private async buildFilterQueries(query: GetProductionInventoryQuery & Record<string, any>) {
		const currentYearMonth = format(new Date(), 'yyyy-MM')
		const allYearMonths = await this.moInventoryAuditModel.findOne(
			{},
			{ _id: 0, year_month: 1 },
			{ sort: { year_month: -1 }, lean: true }
		)
		const latestYearMonth = allYearMonths?.year_month

		const yearMonth = currentYearMonth === latestYearMonth ? currentYearMonth : latestYearMonth

		const filterQueries = MongoQueryBuilder.from({
			brand_name: query.brandName,
			factory_shoes_style: query.shoeStyle,
			color_sn: query.color,
			year_month: yearMonth
		})
			.whereFieldsAreEqual('brand_name', 'factory_shoes_style', 'color_sn', 'year_month')
			.build()

		console.log(`Filter Queries: ${JSON.stringify(filterQueries)}`)

		return filterQueries
	}

	async getInstockManufacturingOrders(
		query: GetProductionInventoryQuery,
		preBuiltQuery?: FilterQuery<MoInventoryAuditDocument>
	) {
		const filterQueries =
			preBuiltQuery && !isEmpty(preBuiltQuery) ? preBuiltQuery : await this.buildFilterQueries(query)

		return await this.moInventoryAuditModel.aggregate<{
			mo_no: string
			brand_name: string
			factory_shoes_style: string
			color_sn: string
			order_qty: number
			instock_qty: number
			size_ledger: Array<{ size_numcode: string; qty: number }>
		}>([
			{ $match: pick(filterQueries, 'year_month') },

			{
				$lookup: {
					from: 'daily_mo_inventory_ledger',
					let: { mo: { $toString: '$mo_no' } },
					pipeline: [
						{
							$match: {
								$expr: {
									$eq: [{ $toString: '$mo_no' }, '$$mo']
								}
							}
						},
						{ $sort: { date: -1 } },
						{ $limit: 1 },
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
				$lookup: {
					from: 'manufacturing_orders',
					localField: 'mo_no',
					foreignField: 'mo_no',
					as: 'mo_info'
				}
			},

			{
				$set: {
					last_inbound_date: { $first: '$last_inbound.last_inbound_date' },

					brand_name: { $first: '$mo_info.brand_name' },
					factory_shoes_style: { $first: '$mo_info.factory_shoes_style' },
					color_sn: { $first: '$mo_info.color_sn' },
					order_qty: { $first: '$mo_info.order_qty' },

					instock_qty: {
						$sum: {
							$map: {
								input: {
									$objectToArray: { $ifNull: ['$size_ledger', {}] }
								},
								as: 'item',
								in: {
									$let: {
										vars: {
											v: '$$item.v'
										},
										in: {
											$add: [
												{ $ifNull: ['$$v.beginning_inventory_qty', 0] },
												{ $ifNull: ['$$v.stocked_in_qty', 0] },
												{ $multiply: [{ $ifNull: ['$$v.shipped_out_qty', 0] }, -1] },
												{ $ifNull: ['$$v.supplemental_stocked_in_qty', 0] },
												{ $multiply: [{ $ifNull: ['$$v.supplemental_shipped_out_qty', 0] }, -1] }
											]
										}
									}
								}
							}
						}
					},

					size_ledger: {
						$map: {
							input: {
								$objectToArray: { $ifNull: ['$size_ledger', {}] }
							},
							as: 'item',
							in: {
								size_numcode: '$$item.k',
								qty: {
									$let: {
										vars: {
											v: '$$item.v'
										},
										in: {
											$add: [
												{ $ifNull: ['$$v.beginning_inventory_qty', 0] },
												{ $ifNull: ['$$v.stocked_in_qty', 0] },
												{ $multiply: [{ $ifNull: ['$$v.shipped_out_qty', 0] }, -1] },
												{ $ifNull: ['$$v.supplemental_stocked_in_qty', 0] },
												{ $multiply: [{ $ifNull: ['$$v.supplemental_shipped_out_qty', 0] }, -1] }
											]
										}
									}
								}
							}
						}
					}
				}
			},

			{ $match: { instock_qty: { $gt: 0 }, ...omit(filterQueries, 'year_month') } },

			{
				$project: {
					_id: 0,
					mo_no: 1,
					last_inbound_date: 1,
					order_qty: 1,
					brand_name: 1,
					factory_shoes_style: 1,
					color_sn: 1,
					size_ledger: 1,
					instock_qty: 1
				}
			},

			{ $sort: { mo_no: -1, last_inbound_date: -1 } }
		])
	}

	private async getIncompletePurchaseOrders(query: GetProductionInventoryQuery) {
		const filterQueries = await this.buildFilterQueries(query)

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

	// return await this.manufacturingOrderModel.aggregate<{
	// 	mo_no: string
	// 	last_inbound_date?: Date
	// 	order_qty: number
	// 	instock_qty: number
	// 	size_ledger: Array<{ size_numcode: string; qty: number }>
	// }>([
	// 	{ $match: filterQueries },
	// 	{
	// 		$addFields: {
	// 			size_items: { $objectToArray: '$size_ledger' }
	// 		}
	// 	},
	// 	{
	// 		$addFields: {
	// 			size_ledger: {
	// 				$map: {
	// 					input: '$size_items',
	// 					as: 's',
	// 					in: {
	// 						size_numcode: '$$s.k',
	// 						qty: {
	// 							$subtract: [
	// 								{
	// 									$add: [
	// 										{ $ifNull: ['$$s.v.stocked_in_qty', 0] },
	// 										{ $ifNull: ['$$s.v.total_return_tx', 0] }
	// 									]
	// 								},
	// 								{
	// 									$add: [
	// 										{ $ifNull: ['$$s.v.shipped_out_qty', 0] },
	// 										{ $ifNull: ['$$s.v.total_recall_tx', 0] }
	// 									]
	// 								}
	// 							]
	// 						}
	// 					}
	// 				}
	// 			}
	// 		}
	// 	},
	// 	{
	// 		$addFields: {
	// 			has_positive_size: {
	// 				$gt: [
	// 					{
	// 						$size: {
	// 							$filter: {
	// 								input: '$size_ledger',
	// 								as: 'x',
	// 								cond: { $gt: ['$$x.qty', 0] }
	// 							}
	// 						}
	// 					},
	// 					0
	// 				]
	// 			},
	// 			instock_qty: {
	// 				$sum: {
	// 					$map: {
	// 						input: '$size_items',
	// 						as: 's',
	// 						in: {
	// 							$subtract: [
	// 								{
	// 									$add: [
	// 										{ $ifNull: ['$$s.v.stocked_in_qty', 0] },
	// 										{ $ifNull: ['$$s.v.total_return_tx', 0] }
	// 									]
	// 								},
	// 								{
	// 									$add: [
	// 										{ $ifNull: ['$$s.v.shipped_out_qty', 0] },
	// 										{ $ifNull: ['$$s.v.total_recall_tx', 0] }
	// 									]
	// 								}
	// 							]
	// 						}
	// 					}
	// 				}
	// 			}
	// 		}
	// 	},
	// 	{
	// 		$match: {
	// 			has_positive_size: true
	// 		}
	// 	},
	// 	{
	// 		$lookup: {
	// 			from: 'daily_mo_inventory_ledger',
	// 			let: { mo: '$mo_no' },
	// 			pipeline: [
	// 				{
	// 					$match: {
	// 						$expr: { $eq: ['$mo_no', '$$mo'] }
	// 					}
	// 				},
	// 				{
	// 					$sort: { date: -1 }
	// 				},
	// 				{
	// 					$limit: 1
	// 				},
	// 				{
	// 					$project: {
	// 						_id: 0,
	// 						last_inbound_date: '$date'
	// 					}
	// 				}
	// 			],
	// 			as: 'last_inbound'
	// 		}
	// 	},
	// 	{
	// 		$addFields: {
	// 			last_inbound_date: {
	// 				$first: '$last_inbound.last_inbound_date'
	// 			}
	// 		}
	// 	},
	// 	{
	// 		$project: {
	// 			_id: 0,
	// 			mo_no: 1,
	// 			last_inbound_date: 1,
	// 			order_qty: 1,
	// 			instock_qty: 1,
	// 			size_ledger: 1
	// 		}
	// 	},
	// 	{
	// 		$match: {
	// 			instock_qty: { $gte: 0 }
	// 		}
	// 	},
	// 	{ $sort: { mo_no: -1 } }
	// ])

	// private async getInstockSizes(query: FilterQuery<MoInventoryAuditDocument>) {
	// 	// const filterQueries = await this.buildFilterQueries(query)

	// 	return await this.moInventoryAuditModel.aggregate<{ size_numcode: string; qty: number }>([
	// 		{
	// 			$match: pick(query, 'year_month')
	// 		},
	// 		{
	// 			$lookup: {
	// 				from : 'manufacturing_orders',

	// 			}
	// 		}
	// 		{
	// 			$project: {
	// 				size_ledger_arr: {
	// 					$objectToArray: { $ifNull: ['$size_ledger', {}] }
	// 				}
	// 			}
	// 		},
	// 		{ $unwind: '$size_ledger_arr' },
	// 		{
	// 			$group: {
	// 				_id: '$size_ledger_arr.k',
	// 				instock_qty: {
	// 					$sum: {
	// 						$let: {
	// 							vars: {
	// 								v: '$size_ledger_arr.v'
	// 							},
	// 							in: {
	// 								$add: [
	// 									{ $ifNull: ['$$v.beginning_inventory_qty', 0] },
	// 									{ $ifNull: ['$$v.stocked_in_qty', 0] },
	// 									{ $multiply: [{ $ifNull: ['$$v.shipped_out_qty', 0] }, -1] },
	// 									{ $ifNull: ['$$v.supplemental_stocked_in_qty', 0] },
	// 									{ $multiply: [{ $ifNull: ['$$v.supplemental_shipped_out_qty', 0] }, -1] }
	// 								]
	// 							}
	// 						}
	// 					}
	// 				}
	// 			}
	// 		},
	// 		{
	// 			$project: {
	// 				_id: 0,
	// 				size_numcode: '$_id',
	// 				qty: '$instock_qty'
	// 			}
	// 		},
	// 		{ $sort: { size: 1 } }
	// 	])
	// }
}
