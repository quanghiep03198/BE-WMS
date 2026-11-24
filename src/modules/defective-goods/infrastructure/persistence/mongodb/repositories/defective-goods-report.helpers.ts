import {
	IDailyInboundDefectiveGoodsReport,
	IDailyOutboundDefectiveGoodsReport
} from '@modules/defective-goods/application/ports/defective-goods-report.repository.port'
import { DefectiveGoodsOutboundPurpose, DefectiveGoodsSource } from '@modules/defective-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { Types } from 'mongoose'
import { createHash } from 'node:crypto'
import { DefectiveGoodsDailyReport } from '../schemas/defective-goods-daily-report.schema'

export type ReportFields = {
	date: string
	type: StockFlow
	brand_name: string
	po: string | null
	mo_no: string | null
	cust_shoes_style: string
	factory_shoes_style: string
	color_sn: string
	sewing_line: unknown
	assembly_line: unknown
	defective_category: string
	shoe_source: DefectiveGoodsSource | null
	storage_location?: string
	outbound_purpose?: DefectiveGoodsOutboundPurpose
}

export type StoredReport<T> = Omit<T, 'sewing_line' | 'assembly_line'> & {
	sewing_line?: unknown
	assembly_line?: unknown
}

export function reportKey(fields: ReportFields): string {
	const lineId = (value: unknown) => (value && typeof value === 'object' && '_id' in value ? String(value._id) : value)
	const identity = {
		...fields,
		sewing_line: lineId(fields.sewing_line),
		assembly_line: lineId(fields.assembly_line)
	}
	return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

export function departmentId(value: unknown): Types.ObjectId | null {
	if (value && typeof value === 'object' && !(value instanceof Types.ObjectId) && '_id' in value) value = value._id
	if (value instanceof Types.ObjectId) return value
	if (typeof value === 'string' && Types.ObjectId.isValid(value)) return new Types.ObjectId(value)
	return null
}

export function reportFields(
	row: DefectiveGoodsDailyReport | IDailyInboundDefectiveGoodsReport | IDailyOutboundDefectiveGoodsReport,
	date: string,
	type: StockFlow
): ReportFields {
	let transactionDimension: { storage_location: string } | { outbound_purpose: DefectiveGoodsOutboundPurpose }
	if (type === 'inbound' && 'storage_location' in row && row.storage_location) {
		transactionDimension = { storage_location: row.storage_location }
	} else if (type === 'outbound' && 'outbound_purpose' in row && row.outbound_purpose) {
		transactionDimension = { outbound_purpose: row.outbound_purpose }
	} else {
		throw new Error(`Invalid legacy defective goods report ${date}:${type}`)
	}
	return {
		date,
		type,
		brand_name: row.brand_name,
		po: row.po ?? null,
		mo_no: row.mo_no ?? null,
		cust_shoes_style: row.cust_shoes_style,
		factory_shoes_style: row.factory_shoes_style,
		color_sn: row.color_sn,
		sewing_line: row.sewing_line ?? null,
		assembly_line: row.assembly_line ?? null,
		defective_category: row.defective_category,
		shoe_source: row.shoe_source ?? null,
		...transactionDimension
	}
}
