import { PipelineStage } from 'mongoose'

type ShippingVariationAlias = 'previous_shipping_variation' | 'current_shipping_variation'

interface BuildCheckoutPipelineParams {
	checkoutMonth: string
	nextMonth: string
}

export class InventoryAuditCheckoutPipelineBuilder {
	public static build(params: BuildCheckoutPipelineParams): PipelineStage[] {
		const { checkoutMonth, nextMonth } = params

		return [
			this.buildMatchCheckoutMonthStage(checkoutMonth),
			this.buildLookupMoInventoryVariationStage(),
			this.buildSetFirstMoInventoryVariationStage(),
			this.buildSetRemainingOrderQtyStage(),
			this.buildMatchRemainingOrderQtyStage(),
			this.buildSetBaseInventoryVariationArrayStage(),
			this.buildLookupDailyVariationStage(nextMonth),
			this.buildLookupShippingVariationStage(checkoutMonth, 'previous_shipping_variation'),
			this.buildLookupShippingVariationStage(nextMonth, 'current_shipping_variation'),
			this.buildNormalizeAggregatedVariationStage(),
			this.buildSetNextMonthInventoryVariationStage(nextMonth),
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

	private static buildLookupMoInventoryVariationStage(): PipelineStage {
		return {
			$lookup: {
				from: 'mo_inventory_variation',
				localField: 'mo_no',
				foreignField: 'mo_no',
				as: 'mo_inventory_variation'
			}
		}
	}

	private static buildSetFirstMoInventoryVariationStage(): PipelineStage {
		return {
			$set: {
				mo_inventory_variation: {
					$first: '$mo_inventory_variation'
				}
			}
		}
	}

	private static buildSetRemainingOrderQtyStage(): PipelineStage {
		return {
			$set: {
				remaining_order_qty: {
					$cond: {
						if: { $ifNull: ['$mo_inventory_variation', false] },
						then: {
							$subtract: [
								'$mo_inventory_variation.order_qty',
								{
									$reduce: {
										input: {
											$objectToArray: {
												$ifNull: ['$mo_inventory_variation.inventory_variation', {}]
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

	private static buildSetBaseInventoryVariationArrayStage(): PipelineStage {
		return {
			$set: {
				base_inventory_variation_array: {
					$map: {
						input: { $objectToArray: '$inventory_variation' },
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

	private static buildLookupDailyVariationStage(nextMonth: string): PipelineStage {
		return {
			$lookup: {
				from: 'daily_mo_inventory_variation',
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
							inventory_variation_array: { $objectToArray: '$inventory_variation' }
						}
					},
					{ $unwind: '$inventory_variation_array' },
					{
						$group: {
							_id: '$inventory_variation_array.k',
							stocked_in_qty: {
								$sum: {
									$subtract: [
										{
											$add: [
												'$inventory_variation_array.v.stocked_in_qty',
												'$inventory_variation_array.v.total_return_tx'
											]
										},
										'$inventory_variation_array.v.total_recall_tx'
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
							inventory_variation: { $push: '$$ROOT' }
						}
					},
					{
						$project: {
							_id: 0,
							inventory_variation: { $arrayToObject: '$inventory_variation' }
						}
					}
				],
				as: 'daily_variation'
			}
		}
	}

	private static buildLookupShippingVariationStage(targetMonth: string, alias: ShippingVariationAlias): PipelineStage {
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
							shipping_variation_array: {
								$objectToArray: {
									$ifNull: ['$shipping_progress_array.v', {}]
								}
							}
						}
					},
					{ $unwind: '$shipping_variation_array' },
					{
						$group: {
							_id: '$shipping_variation_array.k',
							shipped_out_qty: {
								$sum: {
									$cond: {
										if: { $eq: [{ $type: '$shipping_variation_array.v' }, 'object'] },
										then: { $ifNull: ['$shipping_variation_array.v.shipped_out_qty', 0] },
										else: { $ifNull: ['$shipping_variation_array.v', 0] }
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
							inventory_variation: { $push: '$$ROOT' }
						}
					},
					{
						$project: {
							_id: 0,
							inventory_variation: { $arrayToObject: '$inventory_variation' }
						}
					}
				],
				as: alias
			}
		}
	}

	private static buildNormalizeAggregatedVariationStage(): PipelineStage {
		return {
			$set: {
				daily_variation: {
					$ifNull: [{ $first: '$daily_variation' }, { inventory_variation: {} }]
				},
				previous_shipping_variation: {
					$ifNull: [{ $first: '$previous_shipping_variation' }, { inventory_variation: {} }]
				},
				current_shipping_variation: {
					$ifNull: [{ $first: '$current_shipping_variation' }, { inventory_variation: {} }]
				}
			}
		}
	}

	private static buildSetNextMonthInventoryVariationStage(nextMonth: string): PipelineStage {
		return {
			$set: {
				inventory_variation: {
					$arrayToObject: {
						$map: {
							input: '$base_inventory_variation_array',
							as: 'baseSizeItem',
							in: {
								k: '$$baseSizeItem.k',
								v: {
									$let: {
										vars: {
											dailySizeVariation: {
												$first: {
													$map: {
														input: {
															$filter: {
																input: {
																	$objectToArray: '$daily_variation.inventory_variation'
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
											previousShippingSizeVariation: {
												$first: {
													$map: {
														input: {
															$filter: {
																input: {
																	$objectToArray: '$previous_shipping_variation.inventory_variation'
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
											dailyShippingSizeVariation: {
												$first: {
													$map: {
														input: {
															$filter: {
																input: {
																	$objectToArray: '$current_shipping_variation.inventory_variation'
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
													{ $ifNull: ['$$previousShippingSizeVariation.shipped_out_qty', 0] }
												]
											},
											stocked_in_qty: { $ifNull: ['$$dailySizeVariation.stocked_in_qty', 0] },
											shipped_out_qty: {
												$ifNull: ['$$dailyShippingSizeVariation.shipped_out_qty', 0]
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
				'base_inventory_variation_array',
				'daily_variation',
				'previous_shipping_variation',
				'current_shipping_variation',
				'mo_inventory_variation',
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
