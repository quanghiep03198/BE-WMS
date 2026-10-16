/* global use */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('gl3_data_warehouse')

db.manufacturing_orders.updateMany(
	{
		$or: [
			{ brand_name: { $in: ['TEVA', 'KOOLABURRA'] } },
			{
				$and: [
					{ brand_name: 'UGG' },
					{ mo_no: { $regex: '^14C' } },
					{ mo_no: { $nin: ['14C11B078', '14C11B077', '14C03C009'] } }
				]
			}
		]
	},
	[
		{
			$set: {
				size_ledger: {
					$arrayToObject: {
						$map: {
							input: { $objectToArray: '$size_ledger' },
							as: 'sizeItem',
							in: {
								k: '$$sizeItem.k',
								v: {
									$mergeObjects: [
										'$$sizeItem.v',
										{
											stocked_in_qty: '$$sizeItem.v.order_qty',
											shipped_out_qty: '$$sizeItem.v.order_qty'
										}
									]
								}
							}
						}
					}
				}
			}
		}
	]
)
