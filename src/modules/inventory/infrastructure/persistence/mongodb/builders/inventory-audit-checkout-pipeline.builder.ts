import { PipelineStage } from 'mongoose'

type ShippingFluctuationAlias = 'previous_shipping_fluctuation' | 'current_shipping_fluctuation'

interface BuildCheckoutPipelineParams {
	checkoutMonth: string
	nextMonth: string
}

export class InventoryAuditCheckoutPipelineBuilder {
	public static build(params: BuildCheckoutPipelineParams): PipelineStage[] {
		const { checkoutMonth, nextMonth } = params

		return [
			this.buildMatchCheckoutMonthStage(checkoutMonth),
			this.buildLookupMoInventoryFluctuationStage(),
			this.buildSetFirstMoInventoryFluctuationStage(),
			this.buildSetRemainingOrderQtyStage(),
			this.buildMatchRemainingOrderQtyStage(),
			this.buildSetBaseInventoryFluctuationArrayStage(),
			this.buildLookupDailyFluctuationStage(nextMonth),
			this.buildLookupShippingFluctuationStage(checkoutMonth, 'previous_shipping_fluctuation'),
			this.buildLookupShippingFluctuationStage(nextMonth, 'current_shipping_fluctuation'),
			this.buildNormalizeAggregatedFluctuationStage(),
			this.buildSetNextMonthInventoryFluctuationStage(nextMonth),
			this.buildUnsetTemporaryFieldsStage(),
			this.buildMergeToInventoryAuditStage()
		]
	}

	private static buildMatchCheckoutMonthStage(month: string): PipelineStage {
		return {
			$match: {
				year_month: month
			}
		}
	}

	private static buildLookupMoInventoryFluctuationStage(): PipelineStage {
		return {
			$lookup: {
				from: 'manufacturing_orders',
				localField: 'mo_no',
				foreignField: 'mo_no',
				as: 'manufacturing_orders'
			}
		}
	}

	private static buildSetFirstMoInventoryFluctuationStage(): PipelineStage {
		return {
			$set: {
				manufacturing_orders: {
					$first: '$manufacturing_orders'
				}
			}
		}
	}

	private static buildSetRemainingOrderQtyStage(): PipelineStage {
		return {
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
											$objectToArray: {
												$ifNull: ['$manufacturing_orders.size_ledger', {}]
											}
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
		}
	}

	private static buildMatchRemainingOrderQtyStage(): PipelineStage {
		return {
			$match: {
				remaining_order_qty: { $gt: 0 }
			}
		}
	}

	private static buildSetBaseInventoryFluctuationArrayStage(): PipelineStage {
		return {
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
										{
											$add: ['$$sizeItem.v.shipped_out_qty', '$$sizeItem.v.supplemental_shipped_out_qty']
										}
									]
								}
							}
						}
					}
				}
			}
		}
	}

	private static buildLookupDailyFluctuationStage(nextMonth: string): PipelineStage {
		return {
			$lookup: {
				from: 'daily_mo_inventory_ledger',
				let: {
					moNo: '$mo_no'
				},
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [{ $eq: ['$mo_no', '$$moNo'] }, { $eq: [{ $substrBytes: ['$date', 0, 7] }, nextMonth] }]
							}
						}
					},
					{
						$project: {
							size_ledger_array: { $objectToArray: '$size_ledger' }
						}
					},
					{ $unwind: '$size_ledger_array' },
					{
						$group: {
							_id: '$size_ledger_array.k',
							stocked_in_qty: {
								$sum: {
									$subtract: [
										{
											$add: ['$size_ledger_array.v.stocked_in_qty', '$size_ledger_array.v.total_return_tx']
										},
										'$size_ledger_array.v.total_recall_tx'
									]
								}
							}
						}
					},
					{
						$project: {
							_id: 0,
							k: '$_id',
							v: {
								stocked_in_qty: '$stocked_in_qty'
							}
						}
					},
					{
						$group: {
							_id: null,
							size_ledger: { $push: '$$ROOT' }
						}
					},
					{
						$project: {
							_id: 0,
							size_ledger: { $arrayToObject: '$size_ledger' }
						}
					}
				],
				as: 'daily_fluctuation'
			}
		}
	}

	private static buildLookupShippingFluctuationStage(
		targetMonth: string,
		alias: ShippingFluctuationAlias
	): PipelineStage {
		return {
			$lookup: {
				from: 'daily_po_shipping_progress',
				let: {
					moNo: '$mo_no'
				},
				pipeline: [
					{
						$match: {
							$expr: {
								$eq: [{ $substrBytes: ['$date', 0, 7] }, targetMonth]
							}
						}
					},
					{
						$project: {
							shipping_progress_array: {
								$objectToArray: {
									$ifNull: ['$shipping_progress', {}]
								}
							}
						}
					},
					{ $unwind: '$shipping_progress_array' },
					{
						$match: {
							$expr: {
								$eq: ['$shipping_progress_array.k', '$$moNo']
							}
						}
					},
					{
						$project: {
							shipping_fluctuation_array: {
								$objectToArray: {
									$ifNull: ['$shipping_progress_array.v', {}]
								}
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
					{
						$project: {
							_id: 0,
							k: '$_id',
							v: {
								shipped_out_qty: '$shipped_out_qty'
							}
						}
					},
					{
						$group: {
							_id: null,
							size_ledger: { $push: '$$ROOT' }
						}
					},
					{
						$project: {
							_id: 0,
							size_ledger: { $arrayToObject: '$size_ledger' }
						}
					}
				],
				as: alias
			}
		}
	}

	private static buildNormalizeAggregatedFluctuationStage(): PipelineStage {
		return {
			$set: {
				daily_fluctuation: {
					$ifNull: [{ $first: '$daily_fluctuation' }, { size_ledger: {} }]
				},
				previous_shipping_fluctuation: {
					$ifNull: [{ $first: '$previous_shipping_fluctuation' }, { size_ledger: {} }]
				},
				current_shipping_fluctuation: {
					$ifNull: [{ $first: '$current_shipping_fluctuation' }, { size_ledger: {} }]
				}
			}
		}
	}

	private static buildSetNextMonthInventoryFluctuationStage(nextMonth: string): PipelineStage {
		return {
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
																input: {
																	$objectToArray: '$daily_fluctuation.size_ledger'
																},
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
																input: {
																	$objectToArray: '$previous_shipping_fluctuation.size_ledger'
																},
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
																input: {
																	$objectToArray: '$current_shipping_fluctuation.size_ledger'
																},
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
											shipped_out_qty: {
												$ifNull: ['$$dailyShippingSizeLedger.shipped_out_qty', 0]
											},
											supplemental_stocked_in_qty: 0,
											supplemental_shipped_out_qty: 0
										}
									}
								}
							}
						}
					}
				},
				year_month: nextMonth,
				inventory_closure_status: 'pending'
			}
		}
	}

	private static buildUnsetTemporaryFieldsStage(): PipelineStage {
		return {
			$unset: [
				'_id',
				'base_size_ledger_array',
				'daily_fluctuation',
				'previous_shipping_fluctuation',
				'current_shipping_fluctuation',
				'manufacturing_orders',
				'remaining_order_qty'
			]
		}
	}

	private static buildMergeToInventoryAuditStage(): PipelineStage {
		return {
			$merge: {
				into: 'mo_inventory_audit',
				on: ['mo_no', 'year_month'],
				whenMatched: 'merge',
				whenNotMatched: 'insert'
			}
		}
	}
}
