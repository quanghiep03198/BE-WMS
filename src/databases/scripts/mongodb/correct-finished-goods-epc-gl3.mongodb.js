/* global use */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('gl3_data_warehouse')

db.manufacturing_orders.updateMany(
	{
		$or: [
			{ mo_no: { $regex: '^13C' } },
			{ $and: [{ mo_no: { $regex: '^14C' } }, { mo_no: { $nin: ['14C11B078', '14C11B077', '14C03C009'] } }] }
		]
	},
	{ $set: { status: 'shipped' } }
)
