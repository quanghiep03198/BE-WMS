/* global use */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('data_warehouse')

db.manufacturing_orders.updateMany(
	{
		// $or: [{ mo_no: { $nin: instockManufacturingOrders } }, { mo_no: { $regex: '^(?![14|16])' } }]
		mo_no: { $ne: '15A11A001' }
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
											total_recall_tx: 0,
											total_recall_tx: 0,
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
