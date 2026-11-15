import type { OutboundScan } from './daily-po-progress'

export function mapOutboundScan(row: {
	po: unknown
	mo_no: unknown
	size: unknown
	date: unknown
	time: unknown
	quantity: unknown
}): OutboundScan {
	function requiredText(value: unknown, field: string): string {
		if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid outbound scan ${field}`)
		return value.trim()
	}

	if (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity >= 0) {
		throw new Error('Invalid outbound scan quantity')
	}
	return {
		po: requiredText(row.po, 'po'),
		mo_no: requiredText(row.mo_no, 'mo_no'),
		size: requiredText(row.size, 'size'),
		date: requiredText(row.date, 'date'),
		time: requiredText(row.time, 'time'),
		quantity: -row.quantity
	}
}
