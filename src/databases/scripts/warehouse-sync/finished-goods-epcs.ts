import { type mongo } from 'mongoose'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const BATCH_SIZE = 1000

function requiredText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid finished goods EPC ${field}`)
	return value.trim()
}

function optionalText(value: unknown, field: string): string | null {
	if (value === null) return null
	return requiredText(value, field)
}

function requiredDate(value: unknown, field: string): Date {
	const date = value instanceof Date ? new Date(value) : typeof value === 'string' ? new Date(value) : null
	if (!date || !Number.isFinite(date.getTime())) throw new Error(`Invalid finished goods EPC ${field}`)
	return date
}

function optionalDate(value: unknown, field: string): Date | null {
	if (value === null) return null
	return requiredDate(value, field)
}

function sql(includeBackups: boolean): string {
	const inboundBackup = includeBackups
		? `
		UNION ALL
		SELECT a.EPC_Code, c.size_numcode, c.mo_no, a.po, a.rfid_status,
			b.storage_name AS storage_location, a.dept_name,
			c.shoestyle_codefactory AS factory_shoes_style, c.color_sn, a.record_time
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS a
		LEFT OUTER JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b ON a.storage = b.storage_num
		INNER JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS c ON a.EPC_Code = c.EPC_Code
		WHERE a.station_suffix = '101' AND a.EPC_Code NOT LIKE 'E28%'
			AND LEFT(a.mo_no, 2) >= '15'`
		: ''
	const outboundBackup = includeBackups
		? `
		UNION
		SELECT EPC_Code, size_code, mo_no, po, record_time, rfid_status, rfid_use
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
		WHERE station_suffix = '103' AND EPC_Code NOT LIKE 'E28%'
			AND LEFT(mo_no, 2) >= '15'`
		: ''

	return `
		WITH epcs_at_101_history AS (
			SELECT a.EPC_Code, c.size_numcode, c.mo_no, a.po, a.rfid_status,
				b.storage_name AS storage_location, a.dept_name,
				c.shoestyle_codefactory AS factory_shoes_style, c.color_sn, a.record_time
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS a
			LEFT OUTER JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b ON a.storage = b.storage_num
			INNER JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS c ON a.EPC_Code = c.EPC_Code
			WHERE a.station_suffix = '101' AND a.EPC_Code NOT LIKE 'E28%'
			${inboundBackup}
		),
		epcs_at_101_ranked AS (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY EPC_Code ORDER BY record_time DESC) AS rn
			FROM epcs_at_101_history
		),
		epcs_at_101 AS (
			SELECT EPC_Code, size_numcode, mo_no, po, rfid_status, storage_location,
				dept_name, factory_shoes_style, color_sn, record_time
			FROM epcs_at_101_ranked
			WHERE rn = 1
		),
		epcs_at_103_history AS (
			SELECT EPC_Code, size_code, mo_no, po, record_time, rfid_status, rfid_use
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
			WHERE station_suffix = '103' AND EPC_Code NOT LIKE 'E28%'
			${outboundBackup}
		),
		epcs_at_103_ranked AS (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY EPC_Code ORDER BY record_time DESC) AS rn
			FROM epcs_at_103_history
		),
		epcs_at_103 AS (
			SELECT EPC_Code, size_code, mo_no, po, record_time, rfid_status, rfid_use
			FROM epcs_at_103_ranked
			WHERE rn = 1
		)
		SELECT _101.EPC_Code AS epc, _101.size_numcode, _101.mo_no,
			_103.po, _101.factory_shoes_style, _101.color_sn,
			@inboundDeviceSn AS inbound_device_sn,
			IIF(_103.EPC_Code IS NOT NULL, @outboundDeviceSn, NULL) AS outbound_device_sn,
			IIF(_103.record_time > _101.record_time, _103.record_time, _101.record_time) AS last_scanned_at,
			_101.record_time AS inbound_at, _103.record_time AS outbound_at,
			_101.storage_location, _101.dept_name AS assembly_line,
			1 AS inbound_times,
			CASE WHEN _103.EPC_Code IS NOT NULL THEN 'shipped'
				WHEN _101.rfid_status = 'B' THEN 'recalled'
				ELSE 'instock' END AS status
		FROM epcs_at_101 AS _101
		LEFT OUTER JOIN epcs_at_103 AS _103 ON _101.EPC_Code = _103.EPC_Code
		ORDER BY _101.mo_no DESC;
	`
}

type FinishedGoodsEpc = {
	epc: string
	mo_no: string
	size_numcode: string
	po: string | null
	factory_shoes_style: string
	color_sn: string
	inbound_device_sn: string
	outbound_device_sn: string | null
	last_scanned_at: Date
	inbound_at: Date
	outbound_at: Date | null
	storage_location: string
	assembly_line: string
	inbound_times: 1
	status: 'shipped' | 'recalled' | 'instock'
}

function mapFinishedGoodsEpc(row: unknown): FinishedGoodsEpc {
	if (!row || typeof row !== 'object') throw new Error('Invalid finished goods EPC row')
	const fields = [
		'epc',
		'mo_no',
		'size_numcode',
		'po',
		'factory_shoes_style',
		'color_sn',
		'inbound_device_sn',
		'outbound_device_sn',
		'last_scanned_at',
		'inbound_at',
		'outbound_at',
		'storage_location',
		'assembly_line',
		'status'
	]
	if (!fields.every((field) => field in row)) throw new Error('Incomplete finished goods EPC row')

	const source = row as Record<string, unknown>
	const status = requiredText(source.status, 'status')
	if (status !== 'shipped' && status !== 'recalled' && status !== 'instock') {
		throw new Error('Invalid finished goods EPC status')
	}
	const assemblyLine = requiredText(source.assembly_line, 'assembly_line')
	return {
		epc: requiredText(source.epc, 'epc'),
		mo_no: requiredText(source.mo_no, 'mo_no'),
		size_numcode: requiredText(source.size_numcode, 'size_numcode'),
		po: optionalText(source.po, 'po'),
		factory_shoes_style: requiredText(source.factory_shoes_style, 'factory_shoes_style'),
		color_sn: requiredText(source.color_sn, 'color_sn'),
		inbound_device_sn: requiredText(source.inbound_device_sn, 'inbound_device_sn'),
		outbound_device_sn: optionalText(source.outbound_device_sn, 'outbound_device_sn'),
		last_scanned_at: requiredDate(source.last_scanned_at, 'last_scanned_at'),
		inbound_at: requiredDate(source.inbound_at, 'inbound_at'),
		outbound_at: optionalDate(source.outbound_at, 'outbound_at'),
		storage_location: requiredText(source.storage_location, 'storage_location'),
		assembly_line: assemblyLine.replace(/[^A-Za-z0-9]/g, ''),
		inbound_times: 1,
		status
	}
}

export async function runFinishedGoodsEpcStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	options: { inboundDeviceSn: string; outboundDeviceSn: string; includeBackups?: boolean }
): Promise<{ epcs: number }> {
	const inboundDeviceSn = requiredText(options.inboundDeviceSn, 'inbound device SN')
	const outboundDeviceSn = requiredText(options.outboundDeviceSn, 'outbound device SN')
	if (options.includeBackups !== undefined && typeof options.includeBackups !== 'boolean') {
		throw new Error('Invalid finished goods EPC includeBackups option')
	}
	const includeBackups = options.includeBackups ?? false
	const collection = database.collection('finished_goods_epcs')
	const seen = new Set<string>()
	let operations: mongo.AnyBulkWriteOperation[] = []
	let epcs = 0

	async function flush(): Promise<void> {
		if (!operations.length) return
		const batch = operations
		operations = []
		const result = await collection.bulkWrite(batch)
		if (!result.isOk()) throw new Error('Failed finished goods EPC bulk write')
		epcs += batch.length
	}

	for await (const row of streamMssqlRows(pool.request(), sql(includeBackups), {
		inboundDeviceSn,
		outboundDeviceSn
	})) {
		const epc = mapFinishedGoodsEpc(row)
		if (seen.has(epc.epc)) throw new Error(`Duplicate finished goods EPC ${epc.epc}`)
		seen.add(epc.epc)
		const now = new Date()
		operations.push({
			updateOne: {
				filter: { epc: epc.epc },
				update: {
					$set: { ...epc, updated_at: now },
					$setOnInsert: { created_at: now, scannable: true, deleted: false }
				},
				upsert: true
			}
		})
		if (operations.length >= BATCH_SIZE) await flush()
	}
	await flush()
	return { epcs }
}
