use('data_warehouse')

db.purchase_orders.updateMany(
	{ po: { $ne: '500175010' } },
	// [{
	// 	$or: [
	// 		{
	// 			$expr: {
	// 				$let: {
	// 					vars: {
	// 						totalShipped: {
	// 							$sum: {
	// 								$map: {
	// 									input: { $objectToArray: '$shipping_progress' },
	// 									as: 'sp',
	// 									in: '$$sp.v.shipped_out_qty'
	// 								}
	// 							}
	// 						}
	// 					},
	// 					in: {
	// 						$and: [{ $gt: ['$$totalShipped', 0] }, { $lt: ['$$totalShipped', '$order_qty'] }]
	// 					}
	// 				}
	// 			}
	// 		},
	// 		{
	// 			$expr: {
	// 				$anyElementTrue: {
	// 					$map: {
	// 						input: { $objectToArray: '$packing' },
	// 						as: 'p',
	// 						in: {
	// 							$and: [
	// 								{ $regexMatch: { input: '$$p.k', regex: /^14C/ } },
	// 								{ $not: { $in: ['$$p.k', ['14C11B078', '14C11B077', '14C03C009']] } }
	// 							]
	// 						}
	// 					}
	// 				}
	// 			}
	// 		}
	// 	]
	// },
	{
		$set: {
			shipping_progress: {
				$arrayToObject: {
					$map: {
						input: { $objectToArray: '$shipping_progress' },
						as: 'sp',
						in: {
							k: '$$sp.k',
							v: {
								$mergeObjects: [
									'$$sp.v',
									{
										shipped_out_qty: '$$sp.v.order_qty'
									}
								]
							}
						}
					}
				}
			}
		}
	}
	// ]
)
