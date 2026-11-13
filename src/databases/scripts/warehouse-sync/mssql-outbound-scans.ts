import { getVietnamCutoffSqlDate } from './cutoff'
import type { OutboundScan } from './daily-po-progress'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'
import { mapOutboundScan } from './outbound-scan'

const OUTBOUND_SCANS_SQL = `
WITH scans AS (
	SELECT EPC_Code, mo_no, po, size_code, record_time, quantity
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
	WHERE station_suffix = '103' AND rfid_status = 'B' AND isactive = 'Y' AND record_time < @cutoff
	UNION
	SELECT EPC_Code, mo_no, po, size_code, record_time, quantity
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
	WHERE station_suffix = '103' AND rfid_status = 'B' AND isactive = 'Y' AND record_time < @cutoff
)
SELECT s.po, s.mo_no,
	wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(s.size_code) AS size,
	CONVERT(varchar(10), s.record_time, 23) AS date,
	CONVERT(varchar(5), s.record_time, 108) AS time,
	s.quantity
FROM scans AS s
WHERE TRY_CONVERT(int, LEFT(s.mo_no, 2)) >= 14
	AND EXISTS (
		SELECT 1
		FROM wuerp_vnrd.dbo.ta_manufacturmst AS m
		INNER JOIN wuerp_vnrd.dbo.ta_brand AS b ON b.custbrand_id = m.custbrand_id
		WHERE m.mo_no = s.mo_no AND m.cofactory_code = @tenant
			AND m.isactive = 'Y' AND b.brand_code = 'UG'
	)
ORDER BY s.po, CONVERT(varchar(10), s.record_time, 23),
	CONVERT(varchar(5), s.record_time, 108), s.mo_no, s.size_code;
`

export async function* readMssqlOutboundScans(
	request: MssqlStreamRequest,
	tenant: string,
	cutoff: Date
): AsyncGenerator<OutboundScan> {
	if (!tenant.trim()) throw new Error('Tenant is required')
	let skippedMissingPo = 0
	try {
		for await (const row of streamMssqlRows(request, OUTBOUND_SCANS_SQL, {
			tenant,
			cutoff: getVietnamCutoffSqlDate(cutoff)
		})) {
			if (!row || typeof row !== 'object') throw new Error('Invalid outbound SQL row')
			if (!('po' in row && 'mo_no' in row && 'size' in row && 'date' in row && 'time' in row && 'quantity' in row)) {
				throw new Error('Incomplete outbound SQL row')
			}
			if (row.po === null || (typeof row.po === 'string' && !row.po.trim())) {
				skippedMissingPo++
				continue
			}
			yield mapOutboundScan(row)
		}
	} finally {
		if (skippedMissingPo) console.warn(`Skipped ${skippedMissingPo} outbound scans with missing PO`)
	}
}
