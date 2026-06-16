// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('data_warehouse')

db.getCollection('epcs_inbound').aggregate([
	{
		$match: {
			epc: { $regex: /^3034/i },
			mo_no: { $ne: 'Unknown' }
		}
	},
	{
		$lookup: {
			from: 'epcs_outbound',
			localField: 'epc',
			foreignField: 'epc',
			as: 'epcs_outbound'
		}
	},
	{
		$project: {
			_id: 0,
			epc: 1,
			scannable: 1,
			mo_no: 1,
			po: '$epcs_outbound.po',
			factory_code_produce: 1,
			factory_shoes_style: 1,
			color_sn: 1,
			size_numcode: 1,
			inbound_device_sn: '$device_sn',
			inbound_at: '$stored_at',
			outbound_device_sn: '$epcs_outbound.device_sn',
			outbound_at: '$epcs_outbound.stored_at',
			updated_at: '$epcs_outbound.modified_at'
		}
	},
	{
		$unwind: {
			path: '$po',
			preserveNullAndEmptyArrays: true
		}
	},
	{
		$unwind: {
			path: '$outbound_device_sn',
			preserveNullAndEmptyArrays: true
		}
	},
	{
		$unwind: {
			path: '$outbound_at',
			preserveNullAndEmptyArrays: true
		}
	},
	{
		// Persist aggregate result into inventory_epcs (overwrite on each run)
		$out: 'inventory_epcs'
	}
])
