import type { mongo } from 'mongoose'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const MO_INVENTORY_AUDIT_SQL = /* SQL */ `
	WITH storage_list_cte AS (
		SELECT a.mo_no,
			CONCAT('[', STRING_AGG(CAST(CONCAT('"', STRING_ESCAPE(b.storage_name, 'json'), '"') AS NVARCHAR(MAX)), ',')
				WITHIN GROUP (ORDER BY a.storage ASC), ']') AS storage_locations
		FROM (
			SELECT DISTINCT storage, mo_no
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
			WHERE isactive = 'Y' AND storage IS NOT NULL AND dept_name IS NOT NULL
		) AS a
		LEFT OUTER JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b ON b.storage_num = a.storage
		GROUP BY a.mo_no
	),
	agg_data_mst AS (
		SELECT mo_no, inv_yearmonth, brand_name, inv_type,
			shoestyle_cofactory AS factory_shoes_style,
			cofactory_code_mes AS factory_code,
			SUM(ISNULL(mo_qty, 0)) AS mo_qty,
			SUM(ISNULL(inv_initialqty, 0)) AS inv_initialqty,
			SUM(ISNULL(inv_istotalqty, 0)) AS inv_istotalqty,
			SUM(ISNULL(inv_manualqty, 0)) AS inv_manualqty,
			SUM(ISNULL(inv_ostotalqty, 0)) AS inv_ostotalqty,
			SUM(ISNULL(inv_manualqtyout, 0)) AS inv_manualqtyout,
			SUM(ISNULL(inv_finalqty, 0)) AS inv_finalqty
		FROM DV_DATA_LAKE.dbo.dv_invprodmst
		WHERE isactive = 'Y' AND inv_type = 'FG'
			AND mo_no IS NOT NULL AND mo_no <> 'undefined'
			AND cofactory_code_mes = @FactoryCode
		GROUP BY cofactory_code_mes, mo_no, inv_yearmonth, brand_name, shoestyle_cofactory, inv_type, po
	),
	agg_data AS (
		SELECT mo_no, inv_yearmonth, factory_code, brand_name, factory_shoes_style, inv_type,
			MAX(mo_qty) AS mo_qty,
			SUM(inv_initialqty) AS inv_initialqty,
			SUM(inv_istotalqty) AS inv_istotalqty,
			SUM(inv_manualqty) AS inv_manualqty,
			SUM(inv_ostotalqty) AS inv_ostotalqty,
			SUM(inv_manualqtyout) AS inv_manualqtyout,
			SUM(inv_finalqty) AS inv_finalqty
		FROM agg_data_mst
		GROUP BY factory_code, mo_no, factory_shoes_style, inv_yearmonth, brand_name, inv_type
	),
	size_agg AS (
		SELECT c.mo_no, c.inv_yearmonth, c.brand_name, c.inv_type, n.size_numcode,
			CAST(MAX(ISNULL(c.mo_qty, 0)) AS INT) AS order_qty,
			CAST(SUM(ISNULL(c.inv_initialqty, 0)) AS INT) AS beginning_inventory_qty,
			CAST(SUM(ISNULL(c.inv_istotalqty, 0)) AS INT) AS stocked_in_qty,
			CAST(SUM(ISNULL(c.inv_ostotalqty, 0)) AS INT) AS shipped_out_qty,
			CAST(SUM(ISNULL(c.inv_manualqty, 0)) AS INT) AS supplemental_stocked_in_qty,
			CAST(SUM(ISNULL(c.inv_manualqtyout, 0)) AS INT) AS supplemental_shipped_out_qty
		FROM DV_DATA_LAKE.dbo.dv_invprodmst AS c
		CROSS APPLY (SELECT wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(c.size_numcode) AS size_numcode) AS n
		WHERE c.isactive = 'Y' AND c.inv_type = 'FG'
			AND c.cofactory_code_mes = @FactoryCode AND n.size_numcode IS NOT NULL
		GROUP BY c.mo_no, c.inv_yearmonth, c.brand_name, c.inv_type, n.size_numcode
	),
	size_ledger AS (
		SELECT mo_no, inv_yearmonth, brand_name, inv_type,
			CONCAT('{', STRING_AGG(CAST(CONCAT('"', STRING_ESCAPE(size_numcode, 'json'), '":{',
				'"order_qty":', order_qty,
				',"beginning_inventory_qty":', beginning_inventory_qty,
				',"stocked_in_qty":', stocked_in_qty,
				',"shipped_out_qty":', shipped_out_qty,
				',"supplemental_stocked_in_qty":', supplemental_stocked_in_qty,
				',"supplemental_shipped_out_qty":', supplemental_shipped_out_qty,
				'}') AS NVARCHAR(MAX)), ',')
				WITHIN GROUP (ORDER BY TRY_CAST(size_numcode AS FLOAT) ASC, size_numcode ASC), '}') AS size_ledger
		FROM size_agg
		GROUP BY mo_no, inv_yearmonth, brand_name, inv_type
	)
	SELECT a.mo_no, s.storage_locations, sl.size_ledger,
		CONCAT(LEFT(a.inv_yearmonth, 4), '-', RIGHT(a.inv_yearmonth, 2)) AS year_month
	FROM agg_data AS a
	LEFT OUTER JOIN storage_list_cte AS s ON s.mo_no = a.mo_no
	LEFT OUTER JOIN size_ledger AS sl
		ON sl.mo_no = a.mo_no AND sl.inv_yearmonth = a.inv_yearmonth
		AND sl.brand_name = a.brand_name AND sl.inv_type = a.inv_type
	WHERE LEFT(a.mo_no, 2) >= '15'
	ORDER BY a.inv_yearmonth ASC
	OPTION (OPTIMIZE FOR UNKNOWN);
`

const STORAGE_LOCATION_RESOLUTION_PIPELINE = [
	{ $match: { 'storage_locations.0': { $type: 'string' } } },
	{
		$set: {
			storage_locations: {
				$map: {
					input: {
						$filter: {
							input: '$storage_locations',
							cond: { $eq: [{ $type: '$$this' }, 'string'] }
						}
					},
					as: 'n',
					in: { $toUpper: { $trim: { input: '$$n' } } }
				}
			}
		}
	},
	{
		$lookup: {
			from: 'storage_locations',
			localField: 'storage_locations',
			foreignField: 'name',
			as: '_matched'
		}
	},
	{ $set: { storage_locations: '$_matched._id' } },
	{ $unset: '_matched' },
	{
		$merge: {
			into: 'mo_inventory_audit',
			on: '_id',
			whenMatched: 'merge',
			whenNotMatched: 'discard'
		}
	}
]

const BATCH_SIZE = 100

function requiredText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid MO inventory audit ${field}`)
	return value
}

function parseStorageLocations(value: unknown): string[] | null {
	if (value === null) return null
	if (typeof value !== 'string') throw new Error('Invalid MO inventory audit storage_locations')
	const parsed: unknown = JSON.parse(value)
	if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== 'string')) {
		throw new Error('Invalid MO inventory audit storage_locations')
	}
	return parsed
}

function parseSizeLedger(value: unknown, moNo: string): Record<string, Record<string, number>> {
	if (typeof value !== 'string') throw new Error(`Invalid size_ledger for ${moNo}`)
	const parsed: unknown = JSON.parse(value)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Invalid size_ledger for ${moNo}`)
	}
	const ledger: Record<string, Record<string, number>> = {}
	const fields = [
		'order_qty',
		'beginning_inventory_qty',
		'stocked_in_qty',
		'shipped_out_qty',
		'supplemental_stocked_in_qty',
		'supplemental_shipped_out_qty'
	]
	for (const [size, entry] of Object.entries(parsed)) {
		if (!size || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`Invalid size_ledger entry for ${moNo}`)
		}
		const quantities: Record<string, number> = {}
		for (const field of fields) {
			const quantity = (entry as Record<string, unknown>)[field]
			if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
				throw new Error(`Invalid ${field} for ${moNo}, size ${size}`)
			}
			quantities[field] = quantity
		}
		ledger[size] = quantities
	}
	return ledger
}

export async function runMoInventoryAuditStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	factoryCode: string
): Promise<{ audits: number }> {
	const collection = database.collection('mo_inventory_audit')
	let batch: mongo.AnyBulkWriteOperation[] = []
	let audits = 0

	const flushBatch = async () => {
		if (!batch.length) return
		const operations = batch
		batch = []
		const result = await collection.bulkWrite(operations, { ordered: false })
		if (!result.isOk()) throw new Error('Failed to write MO inventory audit batch')
		audits += operations.length
	}

	for await (const row of streamMssqlRows(pool.request(), MO_INVENTORY_AUDIT_SQL, { FactoryCode: factoryCode })) {
		if (!row || typeof row !== 'object') throw new Error('Invalid MO inventory audit row')
		if (!('mo_no' in row && 'storage_locations' in row && 'size_ledger' in row && 'year_month' in row)) {
			throw new Error('Incomplete MO inventory audit row')
		}
		const moNo = requiredText(row.mo_no, 'mo_no')
		const yearMonth = requiredText(row.year_month, 'year_month')
		const now = new Date()
		batch.push({
			updateOne: {
				filter: { mo_no: moNo, year_month: yearMonth },
				update: {
					$set: {
						mo_no: moNo,
						storage_locations: parseStorageLocations(row.storage_locations),
						size_ledger: parseSizeLedger(row.size_ledger, moNo),
						year_month: yearMonth,
						updated_at: now
					},
					$setOnInsert: { created_at: now }
				},
				upsert: true
			}
		})
		if (batch.length >= BATCH_SIZE) await flushBatch()
	}

	await flushBatch()
	await collection.aggregate(STORAGE_LOCATION_RESOLUTION_PIPELINE).toArray()
	return { audits }
}
