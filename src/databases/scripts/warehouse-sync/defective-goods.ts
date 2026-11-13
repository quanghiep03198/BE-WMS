import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import { DepartmentGroup } from '@modules/department/constants'
import { Types, type mongo } from 'mongoose'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

// LIKE also prioritizes inactive flags surrounded by whitespace accepted by trim(); invalid flags are rejected later.
const DEFECTIVE_GOODS_SQL = `
	SELECT sync_id, epc, ri_type, unit, mo_no, po, brand_name, factory_shoes_style,
		cust_shoes_style, color_sn, size_code, defective_category, defective_location,
		defective_description, shoe_source, assembly_line, sewing_line, storage_location,
		inbound_date, outbound_date, outbound_purpose, ri_cancel, isactive,
		user_code_created, user_code_updated
	FROM DV_DATA_LAKE.dbo.dv_defective_goods
	ORDER BY CASE WHEN ri_cancel = 1 OR UPPER(isactive) LIKE '%N%' THEN 0 ELSE 1 END, sync_id;
`

type SourceRow = {
	sync_id: unknown
	epc: unknown
	ri_type: unknown
	unit: unknown
	mo_no: unknown
	po: unknown
	brand_name: unknown
	factory_shoes_style: unknown
	cust_shoes_style: unknown
	color_sn: unknown
	size_code: unknown
	defective_category: unknown
	defective_location: unknown
	defective_description: unknown
	shoe_source: unknown
	assembly_line: unknown
	sewing_line: unknown
	storage_location: unknown
	inbound_date: unknown
	outbound_date: unknown
	outbound_purpose: unknown
	ri_cancel: unknown
	isactive: unknown
	user_code_created: unknown
	user_code_updated: unknown
}

type Reference = { _id: unknown; username?: unknown; group?: unknown; name?: { cn?: unknown } }

function requiredText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid defective goods ${field}`)
	return value.trim()
}

function optionalText(value: unknown, field: string): string | null {
	if (value === null) return null
	if (typeof value !== 'string') throw new Error(`Invalid defective goods ${field}`)
	return value.trim() || null
}

function enumValue<T extends string>(value: unknown, values: Record<string, T>, field: string): T {
	if (typeof value !== 'string' || !Object.values(values).includes(value as T)) {
		throw new Error(`Invalid defective goods ${field}`)
	}
	return value as T
}

function nullableDate(value: unknown, field: string): Date | null {
	if (value === null) return null
	const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
	if (!date || !Number.isFinite(date.getTime())) throw new Error(`Invalid defective goods ${field}`)
	return date
}

function isCancelled(value: unknown): boolean {
	if (value === true || value === 1 || value === '1') return true
	if (value === false || value === 0 || value === '0') return false
	throw new Error('Invalid defective goods ri_cancel')
}

function objectId(value: unknown, field: string): Types.ObjectId {
	if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) {
		throw new Error(`Invalid defective goods ${field}`)
	}
	return new Types.ObjectId(value)
}

function referenceObjectId(reference: Reference, field: string): Types.ObjectId {
	const id = String(reference._id)
	if (!/^[0-9a-f]{24}$/i.test(id)) throw new Error(`Invalid Mongo ${field} reference id`)
	return new Types.ObjectId(id)
}

async function loadReferences(database: mongo.Db) {
	const [users, departments] = await Promise.all([
		database
			.collection('users')
			.find({}, { projection: { _id: 1, username: 1 } })
			.toArray(),
		database
			.collection('departments')
			.find({}, { projection: { _id: 1, group: 1, 'name.cn': 1 } })
			.toArray()
	])
	const userIds = new Map<string, Types.ObjectId>()
	for (const reference of users as Reference[]) {
		if (typeof reference.username === 'string') {
			if (userIds.has(reference.username)) throw new Error(`Duplicate Mongo user ${reference.username}`)
			userIds.set(reference.username, referenceObjectId(reference, 'user'))
		}
	}
	const departmentIds = new Map<string, Types.ObjectId>()
	for (const reference of departments as Reference[]) {
		if (typeof reference.group === 'string' && typeof reference.name?.cn === 'string') {
			const key = JSON.stringify([reference.group, reference.name.cn])
			if (departmentIds.has(key)) throw new Error(`Duplicate Mongo department ${reference.name.cn}`)
			departmentIds.set(key, referenceObjectId(reference, 'department'))
		}
	}
	return { userIds, departmentIds }
}

function rowObject(value: unknown): SourceRow {
	if (!value || typeof value !== 'object') throw new Error('Invalid MSSQL defective goods row')
	const row = value as Record<string, unknown>
	const columns: (keyof SourceRow)[] = [
		'sync_id',
		'epc',
		'ri_type',
		'unit',
		'mo_no',
		'po',
		'brand_name',
		'factory_shoes_style',
		'cust_shoes_style',
		'color_sn',
		'size_code',
		'defective_category',
		'defective_location',
		'defective_description',
		'shoe_source',
		'assembly_line',
		'sewing_line',
		'storage_location',
		'inbound_date',
		'outbound_date',
		'outbound_purpose',
		'ri_cancel',
		'isactive',
		'user_code_created',
		'user_code_updated'
	]
	if (columns.some((column) => !Object.hasOwn(row, column))) {
		throw new Error('Incomplete MSSQL defective goods row')
	}
	return row as SourceRow
}

function resolveReference(value: unknown, ids: Map<string, Types.ObjectId>, field: string): Types.ObjectId | null {
	const username = optionalText(value, field)
	if (username === null) return null
	const id = ids.get(username)
	if (!id) throw new Error(`Unresolved defective goods ${field} ${username}`)
	return id
}

function resolveDepartment(
	value: unknown,
	group: DepartmentGroup,
	ids: Map<string, Types.ObjectId>,
	field: string
): Types.ObjectId | null {
	const name = optionalText(value, field)
	if (name === null) return null
	const id = ids.get(JSON.stringify([group, name]))
	if (!id) throw new Error(`Unresolved defective goods ${field} ${name}`)
	return id
}

export async function runDefectiveGoodsStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db
): Promise<{ defectiveGoods: number }> {
	const { userIds, departmentIds } = await loadReferences(database)
	const collection = database.collection('defective_goods')
	let defectiveGoods = 0

	for await (const source of streamMssqlRows(pool.request(), DEFECTIVE_GOODS_SQL)) {
		const row = rowObject(source)
		const syncId = requiredText(row.sync_id, 'sync_id')
		const _id = objectId(syncId, 'sync_id')
		const epc = requiredText(row.epc, 'epc')
		if (epc.length !== 24) throw new Error('Invalid defective goods epc')
		const factoryShoesStyle = requiredText(row.factory_shoes_style, 'factory_shoes_style').toUpperCase()
		const custShoesStyle = requiredText(row.cust_shoes_style, 'cust_shoes_style')
		const colorSn = requiredText(row.color_sn, 'color_sn')
		const sizeNumcode = requiredText(row.size_code, 'size_code')
		const defectiveCategory = enumValue(row.defective_category, DefectiveCategory, 'defective_category')
		const defectiveLocation = enumValue(row.defective_location, DefectiveLocation, 'defective_location')
		const defectiveDescription = requiredText(row.defective_description, 'defective_description').normalize('NFC')
		const combinationStrategy = enumValue(row.ri_type, CombinationStrategy, 'ri_type')
		const unit = enumValue(row.unit, DefectiveGoodsUnit, 'unit')
		const shoeSource =
			row.shoe_source === null
				? DefectiveGoodsSource.FINAL_INSPECTION
				: enumValue(row.shoe_source, DefectiveGoodsSource, 'shoe_source')
		const outboundPurpose =
			row.outbound_purpose === null
				? null
				: enumValue(row.outbound_purpose, DefectiveGoodsOutboundPurpose, 'outbound_purpose')
		const isActive = requiredText(row.isactive, 'isactive').toUpperCase()
		if (isActive !== 'Y' && isActive !== 'N') throw new Error('Invalid defective goods isactive')
		const deleted = isCancelled(row.ri_cancel) || isActive === 'N'
		const now = new Date()
		const update = {
			$set: {
				epc,
				brand_name: optionalText(row.brand_name, 'brand_name')?.toUpperCase() ?? null,
				mo_no: optionalText(row.mo_no, 'mo_no')?.toUpperCase() ?? null,
				po: optionalText(row.po, 'po')?.toUpperCase() ?? null,
				factory_shoes_style: factoryShoesStyle,
				cust_shoes_style: custShoesStyle,
				color_sn: colorSn,
				size_numcode: sizeNumcode,
				defective_category: defectiveCategory,
				defective_description: defectiveDescription,
				shoe_source: shoeSource,
				assembly_line: resolveDepartment(
					row.assembly_line,
					DepartmentGroup.ASSEMBLY,
					departmentIds,
					'assembly_line'
				),
				sewing_line: resolveDepartment(row.sewing_line, DepartmentGroup.SEWING, departmentIds, 'sewing_line'),
				combination_strategy: combinationStrategy,
				defective_location: defectiveLocation,
				unit,
				storage_location: optionalText(row.storage_location, 'storage_location')?.toUpperCase() ?? null,
				inbound_at: nullableDate(row.inbound_date, 'inbound_date'),
				outbound_at: nullableDate(row.outbound_date, 'outbound_date'),
				outbound_purpose: outboundPurpose,
				created_by: resolveReference(row.user_code_created, userIds, 'user_code_created'),
				updated_by: resolveReference(row.user_code_updated, userIds, 'user_code_updated'),
				deleted,
				deleted_at: deleted ? now : null,
				updated_at: now
			},
			$setOnInsert: { created_at: now }
		}
		const result = await collection.updateOne({ _id }, update, { upsert: true })
		if (!result.acknowledged) throw new Error(`Unacknowledged defective goods write for ${_id}`)
		defectiveGoods++
	}

	return { defectiveGoods }
}
