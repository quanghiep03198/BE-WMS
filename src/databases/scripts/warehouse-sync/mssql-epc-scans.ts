import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { getVietnamCutoffSqlDate } from './cutoff'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

export interface EpcScan {
	epc: string
	mo_no: string
	record_time: Date
	station_no: string
	station_suffix: '101' | '103'
	rfid_status: 'A' | 'B'
	po: string | null
	storage: string | null
	dept_code: string | null
}

function text(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid EPC scan ${field}`)
	return value.trim()
}

function optionalText(value: unknown, field: string): string | null {
	if (value === null) return null
	return text(value, field)
}

export async function* readMssqlEpcScans(
	request: MssqlStreamRequest,
	orders: readonly string[],
	cutoff: Date
): AsyncGenerator<EpcScan> {
	if (!orders.length || orders.length > 100 || new Set(orders).size !== orders.length) {
		throw new Error('Invalid EPC scan order batch')
	}
	getVietnamCutoffSqlDate(cutoff)
	const parameters: Record<string, string> = {}
	for (const [index, order] of orders.entries()) parameters[`mo${index}`] = text(order, 'mo_no')
	parameters.cutoff = formatInTimeZone(cutoff, 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ss")
	const placeholders = orders.map((_, index) => `@mo${index}`).join(', ')
	const sql = /* SQL */ `
		WITH scans AS (
			SELECT EPC_Code, stationNO, station_suffix, rfid_status, record_time, po, storage, dept_code
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
			WHERE isactive = 'Y' AND station_suffix IN ('101', '103') AND record_time < @cutoff
			UNION
			SELECT EPC_Code, stationNO, station_suffix, rfid_status, record_time, po, storage, dept_code
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
			WHERE isactive = 'Y' AND station_suffix IN ('101', '103') AND record_time < @cutoff
		)
		SELECT s.EPC_Code AS epc, ISNULL(m.mo_no_actual, m.mo_no) AS mo_no,
			CONVERT(varchar(23), s.record_time, 126) AS record_time, s.stationNO AS station_no,
			s.station_suffix, s.rfid_status, s.po, s.storage, s.dept_code
		FROM scans AS s
		INNER JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS m ON m.EPC_Code = s.EPC_Code
		WHERE ISNULL(m.mo_no_actual, m.mo_no) IN (${placeholders})
		ORDER BY s.EPC_Code, s.record_time;
	`
	const selected = new Set(orders)
	for await (const row of streamMssqlRows(request, sql, parameters)) {
		if (!row || typeof row !== 'object' || !('mo_no' in row)) throw new Error('Invalid EPC scan row')
		const mo_no = text(row.mo_no, 'mo_no')
		if (!selected.has(mo_no)) throw new Error(`Unexpected EPC scan MO ${mo_no}`)
		if (!(
			'epc' in row &&
			'record_time' in row &&
			'station_no' in row &&
			'station_suffix' in row &&
			'rfid_status' in row &&
			'po' in row &&
			'storage' in row &&
			'dept_code' in row
		))
			throw new Error('Incomplete EPC scan row')
		const timestamp = text(row.record_time, 'record_time')
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(timestamp)) {
			throw new Error('Invalid EPC scan record_time')
		}
		const record_time = fromZonedTime(timestamp, 'Asia/Ho_Chi_Minh')
		if (!Number.isFinite(record_time.getTime()) || record_time >= cutoff)
			throw new Error('Invalid EPC scan record_time')
		if (row.station_suffix !== '101' && row.station_suffix !== '103') throw new Error('Invalid EPC scan station')
		if (row.rfid_status !== 'A' && row.rfid_status !== 'B') throw new Error('Invalid EPC scan status')
		yield {
			epc: text(row.epc, 'epc'),
			mo_no,
			record_time,
			station_no: text(row.station_no, 'station_no'),
			station_suffix: row.station_suffix,
			rfid_status: row.rfid_status,
			po: optionalText(row.po, 'po'),
			storage: optionalText(row.storage, 'storage'),
			dept_code: optionalText(row.dept_code, 'dept_code')
		}
	}
}
