import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import { FilesService } from '@modules/files/files.service'
import { HtmlSanitizerService } from '@modules/files/html-sanitizer.service'
import { migrateLegacyDescription } from '@modules/files/legacy-description'
import { StoredFile, StoredFileSchema } from '@modules/files/stored-file.schema'
import { escapeRegExp } from 'lodash'
import mongoose, { Types, type ClientSession, type mongo } from 'mongoose'
import { createHash } from 'node:crypto'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

// LIKE also prioritizes inactive flags surrounded by whitespace accepted by trim(); invalid flags are rejected later.
const DEFECTIVE_GOODS_SQL = /* SQL */ `
	SELECT keyid, epc, ri_type, unit, mo_no, po, brand_name, factory_shoes_style,
		cust_shoes_style, color_sn, size_code, defective_category, defective_location,
		defective_description, shoe_source, assembly_line, sewing_line, storage_location,
		inbound_date, outbound_date, outbound_purpose, ri_cancel, isactive,
		user_code_created, user_code_updated
	FROM DV_DATA_LAKE.dbo.dv_defective_goods
	ORDER BY CASE WHEN ri_cancel = 1 OR UPPER(isactive) = 'N' THEN 0 ELSE 1 END, keyid;
`

type SourceRow = {
	keyid: unknown
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

type Reference = { _id: unknown; username?: unknown; name?: { cn?: unknown } }

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
			.find({}, { projection: { _id: 1, 'name.cn': 1 } })
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
	const duplicateDepartmentNames = new Set<string>()
	for (const reference of departments as Reference[]) {
		if (typeof reference.name?.cn === 'string' && reference.name.cn.trim()) {
			const name = reference.name.cn
			const id = referenceObjectId(reference, 'department')
			const existing = departmentIds.get(name)
			if (existing) duplicateDepartmentNames.add(name)
			if (!existing || id.toHexString() < existing.toHexString()) departmentIds.set(name, id)
		}
	}
	if (duplicateDepartmentNames.size) {
		console.warn(`Duplicate Mongo department names: ${duplicateDepartmentNames.size}; using lowest ObjectId`)
	}
	return { userIds, departmentIds }
}

function rowObject(value: unknown): SourceRow {
	if (!value || typeof value !== 'object') throw new Error('Invalid MSSQL defective goods row')
	const row = value as Record<string, unknown>
	const columns: (keyof SourceRow)[] = [
		'keyid',
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

function resolveReference(
	value: unknown,
	ids: Map<string, Types.ObjectId>,
	field: string,
	missingUsers: Set<string>
): Types.ObjectId | null {
	const username = optionalText(value, field)
	if (username === null) return null
	const id = ids.get(username)
	if (!id && !missingUsers.has(username)) {
		console.warn(`Unresolved defective goods user ${username}; using null`)
		missingUsers.add(username)
	}
	return id ?? null
}

function createDepartmentResolver(ids: Map<string, Types.ObjectId>) {
	const patterns = [...ids].map(([name, id]) => ({
		name,
		id,
		pattern: new RegExp(`${escapeRegExp(name)}${/\d$/.test(name) ? '(?![0-9])' : ''}`)
	}))
	const cache = new Map<string, Types.ObjectId>()
	return (value: unknown, field: string): Types.ObjectId | undefined => {
		const name = optionalText(value, field)
		if (name === null) return undefined
		const exact = ids.get(name) ?? cache.get(name)
		if (exact) return exact
		const matches = patterns.filter((candidate) => candidate.pattern.test(name))
		matches.sort((a, b) => b.name.length - a.name.length || a.id.toHexString().localeCompare(b.id.toHexString()))
		const match = matches[0]
		if (!match) throw new Error(`Unresolved defective goods ${field} ${name}`)
		if (matches.length > 1) {
			console.warn(`Ambiguous defective goods department ${name}; using ${match.name} (${match.id})`)
		}
		cache.set(name, match.id)
		return match.id
	}
}

export type DefectiveDescriptionDependencies = {
	files: Pick<FilesService, 'upload' | 'syncImageRefs'>
	withTransaction: (operation: (session: ClientSession) => Promise<void>) => Promise<void>
}

function descriptionDependencies(database: mongo.Db): DefectiveDescriptionDependencies {
	const connection = new mongoose.Mongoose().createConnection().setClient(database.client).useDb(database.databaseName)
	const files = new FilesService(connection, connection.model(StoredFile.name, StoredFileSchema))
	return {
		files,
		async withTransaction(operation) {
			const session = await connection.startSession()
			try {
				await session.withTransaction(() => operation(session), { readPreference: 'primary' })
			} finally {
				await session.endSession()
			}
		}
	}
}

export async function runDefectiveGoodsStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	dependencies?: DefectiveDescriptionDependencies,
	creatorUsername = '1009006'
): Promise<{ defectiveGoods: number }> {
	const { userIds, departmentIds } = await loadReferences(database)
	const missingUsers = new Set<string>()
	const resolveDepartment = createDepartmentResolver(departmentIds)
	const collection = database.collection('defective_goods')
	await collection.createIndex(
		{ source_keyid: 1 },
		{
			name: 'idx_defective_goods_source_keyid',
			unique: true,
			partialFilterExpression: { source_keyid: { $exists: true } }
		}
	)
	const sanitizer = new HtmlSanitizerService()
	let defectiveGoods = 0

	for await (const source of streamMssqlRows(pool.request(), DEFECTIVE_GOODS_SQL)) {
		const row = rowObject(source)
		if (typeof row.keyid !== 'number' || !Number.isSafeInteger(row.keyid) || row.keyid <= 0) {
			throw new Error('Invalid defective goods keyid')
		}
		const existing = await collection.findOne({ source_keyid: row.keyid })
		const _id = existing?._id ?? new Types.ObjectId()
		const epc = requiredText(row.epc, 'epc')
		if (epc.length !== 24) throw new Error('Invalid defective goods epc')
		const factoryShoesStyle = requiredText(row.factory_shoes_style, 'factory_shoes_style').toUpperCase()
		const custShoesStyle = requiredText(row.cust_shoes_style, 'cust_shoes_style')
		const colorSn = requiredText(row.color_sn, 'color_sn')
		const sizeNumcode = requiredText(row.size_code, 'size_code')
		const defectiveCategory = enumValue(row.defective_category, DefectiveCategory, 'defective_category')
		const defectiveLocation = enumValue(row.defective_location, DefectiveLocation, 'defective_location')
		if (
			(typeof row.defective_description !== 'string' || !row.defective_description.trim()) &&
			(!Buffer.isBuffer(row.defective_description) || !row.defective_description.length)
		) {
			throw new Error('Invalid defective goods defective_description')
		}
		const defectiveDescription = row.defective_description as string | Buffer
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
		const assemblyLine = resolveDepartment(row.assembly_line, 'assembly_line')
		const sewingLine = resolveDepartment(row.sewing_line, 'sewing_line')
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
				shoe_source: shoeSource,
				...(assemblyLine && { assembly_line: assemblyLine }),
				...(sewingLine && { sewing_line: sewingLine }),
				combination_strategy: combinationStrategy,
				defective_location: defectiveLocation,
				unit,
				storage_location: optionalText(row.storage_location, 'storage_location')?.toUpperCase() ?? null,
				inbound_at: nullableDate(row.inbound_date, 'inbound_date'),
				outbound_at: nullableDate(row.outbound_date, 'outbound_date'),
				outbound_purpose: outboundPurpose,
				created_by: resolveReference(row.user_code_created, userIds, 'user_code_created', missingUsers),
				updated_by: resolveReference(row.user_code_updated, userIds, 'user_code_updated', missingUsers),
				deleted,
				deleted_at: deleted ? now : null,
				updated_at: now
			},
			$setOnInsert: { created_at: now, source_keyid: row.keyid }
		}
		const sourceHash = createHash('sha256').update(defectiveDescription).digest('hex')
		const alreadyMigrated = (document: typeof existing) =>
			document?.description_legacy_hash === sourceHash &&
			typeof document.defective_description === 'string' &&
			Array.isArray(document.description_image_ids)
		dependencies ??= descriptionDependencies(database)
		let description: Awaited<ReturnType<typeof migrateLegacyDescription>> | undefined
		if (!alreadyMigrated(existing)) {
			try {
				description = await migrateLegacyDescription(
					defectiveDescription,
					update.$set.created_by ?? userIds.get(creatorUsername) ?? null,
					dependencies.files,
					sanitizer
				)
			} catch (error) {
				if (error instanceof Error && error.message === 'Missing image owner') {
					throw new Error(
						`Missing image owner for defective goods ${row.keyid}: fallback user ${creatorUsername} not found`,
						{
							cause: error
						}
					)
				}
				throw error
			}
		}
		await dependencies.withTransaction(async (session) => {
			const current = await collection.findOne({ _id }, { session })
			const set: Record<string, unknown> = { ...update.$set }
			if (!alreadyMigrated(current)) {
				if (!description) throw new Error(`Description changed during sync for ${_id}`)
				await dependencies.files.syncImageRefs(
					`defective-goods:${_id}`,
					current?.description_image_ids ?? [],
					description.imageIds,
					session
				)
				Object.assign(set, {
					defective_description: description.html,
					description_image_ids: description.imageIds,
					description_legacy_hash: sourceHash
				})
			}
			const result = await collection.updateOne({ _id }, { ...update, $set: set }, { upsert: true, session })
			if (!result.acknowledged) throw new Error(`Unacknowledged defective goods write for ${_id}`)
		})
		defectiveGoods++
	}

	return { defectiveGoods }
}
