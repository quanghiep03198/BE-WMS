import { Types, type mongo } from 'mongoose'
import { isEligibleMoNo } from './mo-no'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const UNKNOWN_ASSEMBLY_LINE = 'UNKNOWN'

const DAILY_MO_INVENTORY_LEDGER_SQL = `
	WITH src AS (
		SELECT EPC_Code, mo_no, size_code, rfid_status, station_suffix,
			storage, quantity, record_time, dept_name, isactive
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
		WHERE TRY_CONVERT(int, LEFT(mo_no, 2)) >= 14 AND isactive = 'Y' AND rfid_status = 'A'
			AND station_suffix IN ('101', '102')
			AND EPC_Code NOT LIKE '303429%' AND EPC_Code NOT LIKE 'E28%'
			AND mo_no NOT IN ('13D05B006', '13A08C003')
		UNION
		SELECT EPC_Code, mo_no, size_code, rfid_status, station_suffix,
			storage, quantity, record_time, dept_name, isactive
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
		WHERE TRY_CONVERT(int, LEFT(mo_no, 2)) >= 14 AND isactive = 'Y' AND rfid_status = 'A'
			AND station_suffix IN ('101', '102')
			AND EPC_Code NOT LIKE '303429%' AND EPC_Code NOT LIKE 'E28%'
			AND mo_no NOT IN ('13D05B006', '13A08C003')
	),
	base AS (
		SELECT s.EPC_Code, s.mo_no, s.size_code,
			CONVERT(DATE, s.record_time) AS rec_date,
			CONVERT(VARCHAR(5), s.record_time, 108) AS rec_time,
			COALESCE(s.dept_name, '${UNKNOWN_ASSEMBLY_LINE}') AS assembly_line, w.storage_name AS storage_location
		FROM src AS s
		LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet AS w WITH (NOLOCK)
			ON w.storage_num = s.storage
	),
	size_agg AS (
		SELECT rec_date, mo_no, size_code, COUNT(DISTINCT EPC_Code) AS qty
		FROM base
		GROUP BY rec_date, mo_no, size_code
	),
	size_ledger_day AS (
		SELECT rec_date, mo_no,
			'{' + STRING_AGG(
				CAST('"' + STRING_ESCAPE(COALESCE(size_code, ''), 'json')
					+ '":{"stocked_in_qty":' + CAST(qty AS VARCHAR(20)) + '}' AS NVARCHAR(MAX)),
				','
			) WITHIN GROUP (ORDER BY size_code) + '}' AS size_ledger
		FROM size_agg
		GROUP BY rec_date, mo_no
	),
	tx_agg AS (
		SELECT rec_date, mo_no, rec_time, assembly_line, storage_location,
			size_code, COUNT(DISTINCT EPC_Code) AS qty
		FROM base
		GROUP BY rec_date, mo_no, rec_time, assembly_line, storage_location, size_code
	),
	tx_slot AS (
		SELECT rec_date, mo_no, rec_time, assembly_line, storage_location,
			'{' + STRING_AGG(
				CAST('"' + STRING_ESCAPE(COALESCE(size_code, ''), 'json')
					+ '":{"stocked_in_qty":' + CAST(qty AS VARCHAR(20)) + '}' AS NVARCHAR(MAX)),
				','
			) WITHIN GROUP (ORDER BY size_code) + '}' AS size_ledger
		FROM tx_agg
		GROUP BY rec_date, mo_no, rec_time, assembly_line, storage_location
	),
	tx_day AS (
		SELECT day.rec_date, day.mo_no,
			(
				SELECT slot.rec_time AS [time], slot.assembly_line, slot.storage_location,
					JSON_QUERY(slot.size_ledger) AS size_ledger
				FROM tx_slot AS slot
				WHERE slot.rec_date = day.rec_date AND slot.mo_no = day.mo_no
				ORDER BY slot.rec_time, slot.assembly_line, slot.storage_location
				FOR JSON PATH, INCLUDE_NULL_VALUES
			) AS transaction_history
		FROM (SELECT DISTINCT rec_date, mo_no FROM base) AS day
	)
	SELECT ledger.mo_no, CONVERT(VARCHAR(10), ledger.rec_date, 23) AS [date],
		JSON_QUERY(ledger.size_ledger) AS size_ledger,
		JSON_QUERY(tx.transaction_history) AS transaction_history
	FROM size_ledger_day AS ledger
	INNER JOIN tx_day AS tx ON tx.rec_date = ledger.rec_date AND tx.mo_no = ledger.mo_no
	ORDER BY ledger.mo_no, ledger.rec_date;
`

interface SizeQuantity {
	stocked_in_qty: number
}

interface InventoryTransaction {
	time: string
	assembly_line: string
	storage_location: string | null
	size_ledger: Record<string, SizeQuantity>
	voided: false
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid daily MO inventory ledger ${field}`)
	return value.trim()
}

function parseSizeLedger(value: unknown, field: string, serialized: boolean): Record<string, SizeQuantity> {
	if (serialized && typeof value !== 'string') throw new Error(`Invalid daily MO inventory ledger ${field}`)
	let parsed: unknown = value
	if (typeof value === 'string') parsed = JSON.parse(value)
	if (!isRecord(parsed)) throw new Error(`Invalid daily MO inventory ledger ${field}`)
	const ledger: Record<string, SizeQuantity> = {}
	const entries = !serialized && parsed instanceof Map ? parsed.entries() : Object.entries(parsed)
	for (const [size, entry] of entries) {
		if (
			typeof size !== 'string' ||
			!size ||
			!isRecord(entry) ||
			typeof entry.stocked_in_qty !== 'number' ||
			!Number.isFinite(entry.stocked_in_qty)
		) {
			throw new Error(`Invalid daily MO inventory ledger ${field} entry`)
		}
		Object.defineProperty(ledger, size, {
			value: { stocked_in_qty: entry.stocked_in_qty },
			enumerable: true,
			configurable: true,
			writable: true
		})
	}
	return ledger
}

function parseTransaction(item: unknown, moNo: string): InventoryTransaction {
	if (!isRecord(item)) throw new Error(`Invalid transaction_history entry for ${moNo}`)
	const time = requiredText(item.time, 'transaction time')
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Invalid transaction time for ${moNo}`)
	const assemblyLine = requiredText(item.assembly_line ?? UNKNOWN_ASSEMBLY_LINE, 'assembly_line').replace(
		/[^A-Za-z0-9]/g,
		''
	)
	if (!assemblyLine) throw new Error(`Invalid transaction assembly_line for ${moNo}`)
	if (!('storage_location' in item) || (item.storage_location !== null && typeof item.storage_location !== 'string')) {
		throw new Error(`Invalid transaction storage_location for ${moNo}`)
	}
	const sizeLedger = parseSizeLedger(item.size_ledger, 'transaction size_ledger', false)
	if (!Object.keys(sizeLedger).length) throw new Error(`Empty transaction size_ledger for ${moNo}`)
	return {
		time,
		assembly_line: assemblyLine,
		storage_location: item.storage_location === null ? null : requiredText(item.storage_location, 'storage_location'),
		size_ledger: sizeLedger,
		voided: false
	}
}

function parseTransactionHistory(value: unknown, moNo: string): InventoryTransaction[] {
	if (typeof value !== 'string') throw new Error(`Invalid transaction_history for ${moNo}`)
	const parsed: unknown = JSON.parse(value)
	if (!Array.isArray(parsed)) throw new Error(`Invalid transaction_history for ${moNo}`)
	return parsed.map((item) => parseTransaction(item, moNo))
}

function isObjectIdReference(value: unknown): value is Types.ObjectId {
	return value instanceof Types.ObjectId
}

function normalizedAssemblyLine(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value]
	return [
		...new Set(
			values
				.filter((item): item is string => typeof item === 'string')
				.map((item) => item.replace(/[^A-Za-z0-9]/g, ''))
				.filter(Boolean)
		)
	]
}

function unresolvedExistingReference(
	field: string,
	value: Types.ObjectId,
	moNo: string,
	date: string,
	detail?: string
): never {
	const cause = detail ? ` (${detail})` : ''
	throw new Error(
		`Unresolved existing daily MO transaction reference for ${moNo} on ${date}: ${field} ObjectId ${value.toHexString()}${cause}`
	)
}

async function existingAssemblyLines(
	value: unknown,
	database: mongo.Db,
	moNo: string,
	date: string
): Promise<string[]> {
	if (typeof value === 'string') return normalizedAssemblyLine(value)
	if (!isObjectIdReference(value)) return []
	let department: unknown
	try {
		department = await database.collection('departments').findOne({ _id: value })
	} catch (error) {
		unresolvedExistingReference(
			'assembly_line',
			value,
			moNo,
			date,
			error instanceof Error ? error.message : String(error)
		)
	}
	if (!isRecord(department)) unresolvedExistingReference('assembly_line', value, moNo, date)
	const names = isRecord(department.name) ? Object.values(department.name) : [department.name]
	const lines = normalizedAssemblyLine([...names, department.code])
	if (!lines.length) unresolvedExistingReference('assembly_line', value, moNo, date)
	return lines
}

async function existingStorageLocations(
	value: unknown,
	database: mongo.Db,
	moNo: string,
	date: string
): Promise<Array<string | null>> {
	if (value === null) return [null]
	if (typeof value === 'string') return [value.trim()].filter(Boolean)
	if (!isObjectIdReference(value)) return []
	let location: unknown
	try {
		location = await database.collection('storage_locations').findOne({ _id: value })
	} catch (error) {
		unresolvedExistingReference(
			'storage_location',
			value,
			moNo,
			date,
			error instanceof Error ? error.message : String(error)
		)
	}
	if (!isRecord(location) || typeof location.name !== 'string' || !location.name.trim()) {
		unresolvedExistingReference('storage_location', value, moNo, date)
	}
	return [location.name.trim()]
}

async function parseExistingTransactions(
	value: unknown,
	moNo: string,
	date: string,
	database: mongo.Db
): Promise<InventoryTransaction[]> {
	if (!isRecord(value)) return []
	const assemblyLines = await existingAssemblyLines(value.assembly_line, database, moNo, date)
	const storageLocations = await existingStorageLocations(value.storage_location, database, moNo, date)
	if (!assemblyLines.length || !storageLocations.length) return []
	try {
		const transaction = parseTransaction(
			{ ...value, assembly_line: assemblyLines[0], storage_location: storageLocations[0] },
			moNo
		)
		return assemblyLines.flatMap((assemblyLine) =>
			storageLocations.map((storageLocation) => ({
				...transaction,
				assembly_line: assemblyLine,
				storage_location: storageLocation
			}))
		)
	} catch {
		return []
	}
}

function transactionSignature(moNo: string, date: string, transaction: InventoryTransaction): string {
	const sizes = Object.entries(transaction.size_ledger)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([size, quantity]) => [size, quantity.stocked_in_qty])
	return JSON.stringify([moNo, date, transaction.time, transaction.assembly_line, transaction.storage_location, sizes])
}

async function existingTransactionIds(
	history: unknown,
	moNo: string,
	date: string,
	database: mongo.Db
): Promise<Map<string, string>> {
	const ids = new Map<string, string>()
	if (!(history instanceof Map) && !isRecord(history)) return ids
	const entries = history instanceof Map ? history.entries() : Object.entries(history)
	for (const [id, value] of entries) {
		if (typeof id !== 'string' || !id.trim()) continue
		for (const transaction of await parseExistingTransactions(value, moNo, date, database)) {
			const signature = transactionSignature(moNo, date, transaction)
			const previousId = ids.get(signature)
			if (previousId && previousId !== id) {
				throw new Error(`Duplicate daily MO transaction signature for ${moNo} on ${date}`)
			}
			ids.set(signature, id)
		}
	}
	return ids
}

function formatDate(value: unknown): string {
	const date = requiredText(value, 'date')
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid daily MO inventory ledger date')
	const parsed = new Date(`${date}T00:00:00.000Z`)
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
		throw new Error('Invalid daily MO inventory ledger date')
	}
	return date
}

export async function runDailyMoInventoryLedgerStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	generateId: (date: string) => string | Promise<string>
): Promise<{ ledgers: number }> {
	const collection = database.collection('daily_mo_inventory_ledger')
	const batch: mongo.AnyBulkWriteOperation[] = []
	let ledgers = 0

	const flushBatch = async () => {
		if (!batch.length) return
		const operations = batch.splice(0, batch.length)
		await collection.bulkWrite(operations, { ordered: false })
		ledgers += operations.length
	}

	for await (const row of streamMssqlRows(pool.request(), DAILY_MO_INVENTORY_LEDGER_SQL)) {
		if (!isRecord(row)) throw new Error('Invalid daily MO inventory ledger row')
		if (!('mo_no' in row && 'date' in row && 'size_ledger' in row && 'transaction_history' in row)) {
			throw new Error('Incomplete daily MO inventory ledger row')
		}
		const moNo = requiredText(row.mo_no, 'mo_no')
		if (!isEligibleMoNo(moNo)) throw new Error(`Invalid daily MO inventory ledger MO ${moNo}`)
		const date = formatDate(row.date)
		const sizeLedger = parseSizeLedger(row.size_ledger, 'size_ledger', true)
		const transactionHistory = parseTransactionHistory(row.transaction_history, moNo)
		if (!Object.keys(sizeLedger).length || !transactionHistory.length) continue

		const existing = await collection.findOne({ mo_no: moNo, date }, { projection: { transaction_history: 1 } })
		const existingIds = await existingTransactionIds(existing?.transaction_history, moNo, date, database)
		const keyedHistory: Record<string, InventoryTransaction> = {}
		const seenSignatures = new Set<string>()
		for (const transaction of transactionHistory) {
			const signature = transactionSignature(moNo, date, transaction)
			if (seenSignatures.has(signature))
				throw new Error(`Duplicate daily MO transaction signature for ${moNo} on ${date}`)
			seenSignatures.add(signature)
			const id = existingIds.get(signature) ?? requiredText(await generateId(date), 'transaction id')
			if (Object.hasOwn(keyedHistory, id)) throw new Error(`Duplicate daily MO transaction id ${id}`)
			Object.defineProperty(keyedHistory, id, {
				value: transaction,
				enumerable: true,
				configurable: true,
				writable: true
			})
		}
		batch.push({
			updateOne: {
				filter: { mo_no: moNo, date },
				update: {
					$set: {
						mo_no: moNo,
						date,
						size_ledger: sizeLedger,
						created_at: new Date(`${date}T00:00:00.000Z`),
						transaction_history: keyedHistory
					}
				},
				upsert: true
			}
		})
		if (batch.length >= 100) await flushBatch()
	}

	await flushBatch()
	return { ledgers }
}
