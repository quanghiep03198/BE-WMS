import type { PipelineStage } from 'mongoose'

export function defectiveGoodsDailyReportPipeline(
	type: 'inbound' | 'outbound',
	range?: { from: Date; to: Date },
	timezone = 'UTC'
): PipelineStage[] {
	const inbound = type === 'inbound'
	const dateField = inbound ? 'inbound_at' : 'outbound_at'
	const dimensions = [
		'brand_name',
		'po',
		'mo_no',
		'cust_shoes_style',
		'factory_shoes_style',
		'color_sn',
		'sewing_line',
		'assembly_line',
		'defective_category',
		'shoe_source',
		inbound ? 'storage_location' : 'outbound_purpose'
	]
	const firstGroup = Object.fromEntries(dimensions.map((field) => [field, `$${field}`]))
	const secondGroup = Object.fromEntries(dimensions.map((field) => [field, `$_id.${field}`]))
	const projection = Object.fromEntries(
		dimensions
			.filter((field) => field !== 'assembly_line' && field !== 'sewing_line')
			.map((field) => [field, `$_id.${field}`])
	)

	return [
		{
			$match: {
				[dateField]: range ? { $gte: range.from, $lt: range.to } : { $type: 'date' },
				[inbound ? 'storage_location' : 'outbound_purpose']: { $ne: null }
			}
		},
		{ $addFields: { date_str: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone } } } },
		{
			$group: {
				_id: { date: '$date_str', ...firstGroup, size_numcode: '$size_numcode' },
				qty: { $sum: 1 }
			}
		},
		{
			$group: {
				_id: { date: '$_id.date', ...secondGroup },
				size_ledger: { $push: { size_numcode: '$_id.size_numcode', qty: '$qty' } },
				...(inbound ? { total_qty: { $sum: '$qty' } } : {})
			}
		},
		{
			$lookup: {
				from: 'departments',
				localField: '_id.assembly_line',
				foreignField: '_id',
				as: 'assembly_line_info'
			}
		},
		{
			$lookup: {
				from: 'departments',
				localField: '_id.sewing_line',
				foreignField: '_id',
				as: 'sewing_line_info'
			}
		},
		{
			$addFields: {
				assembly_line_info: { $first: '$assembly_line_info' },
				sewing_line_info: { $first: '$sewing_line_info' }
			}
		},
		{
			$project: {
				_id: 0,
				date: '$_id.date',
				...projection,
				assembly_line: '$assembly_line_info',
				sewing_line: '$sewing_line_info',
				size_ledger: 1,
				...(inbound ? { total_qty: 1 } : {})
			}
		},
		{ $sort: inbound ? { date: 1, brand_name: 1, po: 1, mo_no: 1 } : { brand_name: 1, po: 1, mo_no: 1 } }
	]
}
