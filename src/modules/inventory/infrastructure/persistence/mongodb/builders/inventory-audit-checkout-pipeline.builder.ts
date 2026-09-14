import { PipelineStage } from 'mongoose'

type ShippingFluctuationAlias = 'previous_shipping_fluctuation' | 'current_shipping_fluctuation'

interface BuildCheckoutPipelineParams {
	checkoutMonth: string
	nextMonth: string
}

export class InventoryAuditCheckoutPipelineBuilder {
	private readonly stages: PipelineStage[] = []

	private constructor(
		private readonly checkoutMonth: string,
		private readonly nextMonth: string
	) {}

	public static build(params: BuildCheckoutPipelineParams): PipelineStage[] {
		return new InventoryAuditCheckoutPipelineBuilder(params.checkoutMonth, params.nextMonth)
			.matchCheckoutMonth()
			.lookupMoInventory()
			.setFirstMoInventory()
			.setRemainingOrderQty()
			.matchRemainingOrderQty()
			.setBaseInventoryFluctuationArray()
			.lookupDailyFluctuation()
			.lookupShippingFluctuation('previous_shipping_fluctuation')
			.lookupShippingFluctuation('current_shipping_fluctuation')
			.normalizeAggregatedFluctuation()
			.setNextMonthInventoryFluctuation()
			.unsetTemporaryFields()
			.mergeToInventoryAudit()
			.toPipeline()
	}

	private matchCheckoutMonth(): this {
		this.stages.push({
			$match: { year_month: this.checkoutMonth }
		})
		return this
	}

	private lookupMoInventory(): this {
		this.stages.push({
			$lookup: {
				from: 'manufacturing_orders',
				localField: 'mo_no',
				foreignField: 'mo_no',
				as: 'manufacturing_orders'
			}
		})
		return this
	}

	private setFirstMoInventory(): this {
		this.stages.push({
			$set: { manufacturing_orders: { $first: '$manufacturing_orders' } }
		})
		return this
	}

	private setRemainingOrderQty(): this {
		this.stages.push({
			$set: {
				remaining_order_qty: {
					$cond: {
						if: { $ifNull: ['$manufacturing_orders', false] },
						then: {
							$subtract: [
								'$manufacturing_orders.order_qty',
								{
									$reduce: {
										input: {
											$objectToArray: { $ifNull: ['$manufacturing_orders.size_ledger', {}] }
										},
										initialValue: 0,
										in: { $add: ['$$value', { $ifNull: ['$$this.v.shipped_out_qty', 0] }] }
									}
								}
							]
						},
						else: 1
					}
				}
			}
		})
		return this
	}

	private matchRemainingOrderQty(): this {
		this.stages.push({
			$match: { remaining_order_qty: { $gt: 0 } }
		})
		return this
	}

	private setBaseInventoryFluctuationArray(): this {
		this.stages.push({
			$set: {
				base_size_ledger_array: {
					$map: {
						input: { $objectToArray: '$size_ledger' },
						as: 'sizeItem',
						in: {
							k: '$$sizeItem.k',
							v: {
								order_qty: '$$sizeItem.v.order_qty',
								beginning_inventory_qty: {
									$subtract: [
										{
											$add: [
												'$$sizeItem.v.beginning_inventory_qty',
												'$$sizeItem.v.stocked_in_qty',
												'$$sizeItem.v.supplemental_stocked_in_qty'
											]
										},
										{ $add: ['$$sizeItem.v.shipped_out_qty', '$$sizeItem.v.supplemental_shipped_out_qty'] }
									]
								}
							}
						}
					}
				}
			}
		})
		return this
	}

	private lookupDailyFluctuation(): this {
		this.stages.push({
			$lookup: {
				from: 'daily_mo_inventory_ledger',
				let: { moNo: '$mo_no' },
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [
									{ $eq: ['$mo_no', '$$moNo'] },
									{ $eq: [{ $substrBytes: ['$date', 0, 7] }, this.nextMonth] }
								]
							}
						}
					},
					{ $project: { size_ledger_array: { $objectToArray: '$size_ledger' } } },
					{ $unwind: '$size_ledger_array' },
					{
						$group: {
							_id: '$size_ledger_array.k',
							stocked_in_qty: {
								$sum: {
									$subtract: [
										{ $add: ['$size_ledger_array.v.stocked_in_qty', '$size_ledger_array.v.total_return_tx'] },
										'$size_ledger_array.v.total_recall_tx'
									]
								}
							}
						}
					},
					{ $project: { _id: 0, k: '$_id', v: { stocked_in_qty: '$stocked_in_qty' } } },
					{ $group: { _id: null, size_ledger: { $push: '$$ROOT' } } },
					{ $project: { _id: 0, size_ledger: { $arrayToObject: '$size_ledger' } } }
				],
				as: 'daily_fluctuation'
			}
		})
		return this
	}

	private lookupShippingFluctuation(alias: ShippingFluctuationAlias): this {
		const targetMonth = alias === 'previous_shipping_fluctuation' ? this.checkoutMonth : this.nextMonth

		this.stages.push({
			$lookup: {
				from: 'daily_po_shipping_progress',
				let: { moNo: '$mo_no' },
				pipeline: [
					{ $match: { $expr: { $eq: [{ $substrBytes: ['$date', 0, 7] }, targetMonth] } } },
					{
						$project: {
							shipping_progress_array: { $objectToArray: { $ifNull: ['$shipping_progress', {}] } }
						}
					},
					{ $unwind: '$shipping_progress_array' },
					{ $match: { $expr: { $eq: ['$shipping_progress_array.k', '$$moNo'] } } },
					{
						$project: {
							shipping_fluctuation_array: {
								$objectToArray: { $ifNull: ['$shipping_progress_array.v', {}] }
							}
						}
					},
					{ $unwind: '$shipping_fluctuation_array' },
					{
						$group: {
							_id: '$shipping_fluctuation_array.k',
							shipped_out_qty: {
								$sum: {
									$cond: {
										if: { $eq: [{ $type: '$shipping_fluctuation_array.v' }, 'object'] },
										then: { $ifNull: ['$shipping_fluctuation_array.v.shipped_out_qty', 0] },
										else: { $ifNull: ['$shipping_fluctuation_array.v', 0] }
									}
								}
							}
						}
					},
					{ $project: { _id: 0, k: '$_id', v: { shipped_out_qty: '$shipped_out_qty' } } },
					{ $group: { _id: null, size_ledger: { $push: '$$ROOT' } } },
					{ $project: { _id: 0, size_ledger: { $arrayToObject: '$size_ledger' } } }
				],
				as: alias
			}
		})
		return this
	}

	private normalizeAggregatedFluctuation(): this {
		this.stages.push({
			$set: {
				daily_fluctuation: { $ifNull: [{ $first: '$daily_fluctuation' }, { size_ledger: {} }] },
				previous_shipping_fluctuation: {
					$ifNull: [{ $first: '$previous_shipping_fluctuation' }, { size_ledger: {} }]
				},
				current_shipping_fluctuation: {
					$ifNull: [{ $first: '$current_shipping_fluctuation' }, { size_ledger: {} }]
				}
			}
		})
		return this
	}

	private setNextMonthInventoryFluctuation(): this {
		this.stages.push({
			$set: {
				size_ledger: {
					$arrayToObject: {
						$map: {
							input: '$base_size_ledger_array',
							as: 'baseSizeItem',
							in: {
								k: '$$baseSizeItem.k',
								v: {
									$let: {
										vars: {
											dailySizeLedger: {
												$first: {
													$map: {
														input: {
															$filter: {
																input: { $objectToArray: '$daily_fluctuation.size_ledger' },
																as: 'dailyItem',
																cond: { $eq: ['$$dailyItem.k', '$$baseSizeItem.k'] }
															}
														},
														as: 'matchedDailyItem',
														in: '$$matchedDailyItem.v'
													}
												}
											},
											previousShippingSizeLedger: {
												$first: {
													$map: {
														input: {
															$filter: {
																input: { $objectToArray: '$previous_shipping_fluctuation.size_ledger' },
																as: 'shippingItem',
																cond: { $eq: ['$$shippingItem.k', '$$baseSizeItem.k'] }
															}
														},
														as: 'matchedShippingItem',
														in: '$$matchedShippingItem.v'
													}
												}
											},
											dailyShippingSizeLedger: {
												$first: {
													$map: {
														input: {
															$filter: {
																input: { $objectToArray: '$current_shipping_fluctuation.size_ledger' },
																as: 'shippingItem',
																cond: { $eq: ['$$shippingItem.k', '$$baseSizeItem.k'] }
															}
														},
														as: 'matchedShippingItem',
														in: '$$matchedShippingItem.v'
													}
												}
											}
										},
										in: {
											order_qty: '$$baseSizeItem.v.order_qty',
											beginning_inventory_qty: {
												$subtract: [
													'$$baseSizeItem.v.beginning_inventory_qty',
													{ $ifNull: ['$$previousShippingSizeLedger.shipped_out_qty', 0] }
												]
											},
											stocked_in_qty: { $ifNull: ['$$dailySizeLedger.stocked_in_qty', 0] },
											shipped_out_qty: { $ifNull: ['$$dailyShippingSizeLedger.shipped_out_qty', 0] },
											supplemental_stocked_in_qty: 0,
											supplemental_shipped_out_qty: 0
										}
									}
								}
							}
						}
					}
				},
				year_month: this.nextMonth,
				inventory_closure_status: 'pending'
			}
		})
		return this
	}

	private unsetTemporaryFields(): this {
		this.stages.push({
			$unset: [
				'_id',
				'base_size_ledger_array',
				'daily_fluctuation',
				'previous_shipping_fluctuation',
				'current_shipping_fluctuation',
				'manufacturing_orders',
				'remaining_order_qty'
			]
		})
		return this
	}

	private mergeToInventoryAudit(): this {
		this.stages.push({
			$merge: {
				into: 'mo_inventory_audit',
				on: ['mo_no', 'year_month'],
				whenMatched: 'merge',
				whenNotMatched: 'insert'
			}
		})
		return this
	}

	private toPipeline(): PipelineStage[] {
		return this.stages
	}
}
