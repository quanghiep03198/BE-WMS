import { DATA_SOURCE_DATA_LAKE_CENTRAL } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PackingEntity } from '../entities/packing.entity'
import { buildManifestFilter, manifestSortColumn } from './manifest-filter'
import type { ManifestFilterDto, ManifestListDto } from './manifest-filter.dto'

export interface ManifestRow {
	po: string | null
	brand_name: string | null
	factory_shoes_style: string | null
	cust_shoes_style: string
	color_sn: string | null
	packing_standard: string | null
	original_size_data: string
	factory_code_produce: string
	standard_weight: number | null
	actual_avg_weight: number | null
	target_box_qty: number
	target_item_qty: number | null
	weighed_box_qty: number
	unweighed_box_qty: number
	cursor_id: number
}

// Keep the aggregation aligned with the legacy SQL while its rollback endpoint is supported.
const manifestSource = `
DECLARE @TargetFactory NVARCHAR(10) = CASE @0
	WHEN 'VA1' THEN 'GL1' WHEN 'VB2' THEN 'GL3' WHEN 'CA1' THEN 'GL4' ELSE @0 END;
WITH packing_stats AS (
	SELECT po, Size, COUNT(DISTINCT Series_number) AS total_boxes
	FROM DV_DATA_LAKE.dbo.PackingPlan WITH(NOLOCK, INDEX(IX_PackingPlan_po_size_factory))
	WHERE Factory_code = @TargetFactory GROUP BY po, Size
), manifest AS (
	SELECT pk.po, pk.Size AS original_size_data, pl.brand AS brand_name, pl.shoestyle_codefactory AS factory_shoes_style,
		CONCAT(pl.shoestyle_codecust, '/', pl.shoestyle_namecust) AS cust_shoes_style, pl.color_sn,
		CASE WHEN CHARINDEX('#', pk.Size) > 0 THEN (
			SELECT STRING_AGG('#' + CASE WHEN CHARINDEX('(', LTRIM(RTRIM(value))) > 0
				AND CHARINDEX(')', LTRIM(RTRIM(value))) > 0 THEN REPLACE(LTRIM(RTRIM(value)), ',', '')
				ELSE LTRIM(RTRIM(value)) END, ';')
			FROM STRING_SPLIT(SUBSTRING(pk.Size, CHARINDEX('#', pk.Size), LEN(pk.Size)), '#')
			WHERE LTRIM(RTRIM(value)) != '' AND LTRIM(RTRIM(value)) LIKE '%(%'
		) ELSE pk.Size END AS packing_standard,
		@0 AS factory_code_produce, ROUND(pk.Weight, 2) AS standard_weight,
		ROUND(AVG(pk.Actual_weight_in), 2) AS actual_avg_weight, ps.total_boxes AS target_box_qty,
		(SELECT SUM(TRY_CAST(REPLACE(SUBSTRING(value, CHARINDEX('(', value) + 1,
			CHARINDEX(')', value) - CHARINDEX('(', value) - 1), ',', '') AS INT))
		 FROM (SELECT LTRIM(RTRIM(value)) AS value
			FROM STRING_SPLIT(CASE WHEN CHARINDEX('#', pk.Size) > 0
				THEN SUBSTRING(pk.Size, CHARINDEX('#', pk.Size), LEN(pk.Size)) ELSE pk.Size END, '#')
			WHERE LTRIM(RTRIM(value)) != '' AND CHARINDEX('(', value) > 0 AND CHARINDEX(')', value) > 0
		 ) AS hash_items) AS target_item_qty,
		COUNT(DISTINCT pk.Series_number) AS weighed_box_qty,
		ps.total_boxes - COUNT(DISTINCT pk.Series_number) AS unweighed_box_qty,
		MIN(pk.keyid) AS cursor_id
	FROM DV_DATA_LAKE.dbo.PackingPlan pk WITH(NOLOCK, INDEX(IX_PackingPlan_factory_po_size))
	INNER JOIN DV_DATA_LAKE.dbo.dv_OrderProcessR05 pl ON pk.po = pl.po
	INNER JOIN packing_stats ps ON pk.po = ps.po AND pk.Size = ps.Size
	WHERE pk.Factory_code = @TargetFactory AND pk.Size LIKE '%#%' AND pk.Size LIKE '%(%' AND pk.Size LIKE '%)%'
	GROUP BY CAST(pk.created AS DATE), pk.Factory_code, pl.brand, pk.po,
		pl.shoestyle_codefactory, CONCAT(pl.shoestyle_codecust, '/', pl.shoestyle_namecust),
		pk.Size, pl.color_sn, pk.Weight, ps.total_boxes
)
`

const cursorFields = ['cust_shoes_style', 'cursor_id', 'brand_name', 'factory_shoes_style', 'color_sn'] as const
const cursorOrder = cursorFields.map((field) => `[${field}] ASC`).join(', ')
const pageFields = ['cust_shoes_style', 'brand_name', 'factory_shoes_style', 'color_sn', 'cursor_id'] as const

@Injectable()
export class ManifestRepository {
	constructor(
		@InjectRepository(PackingEntity, DATA_SOURCE_DATA_LAKE_CENTRAL)
		private readonly repository: Repository<PackingEntity>
	) {}

	async count(factoryCode: string, filter: ManifestFilterDto): Promise<number> {
		const where = buildManifestFilter(filter, 1)
		const rows = await this.repository.query<Array<{ total: number }>>(
			`${manifestSource} SELECT COUNT_BIG(*) AS total FROM manifest WHERE ${where.sql}`,
			[factoryCode, ...where.parameters]
		)
		return Number(rows[0].total)
	}

	async page(factoryCode: string, filter: ManifestListDto): Promise<ManifestRow[]> {
		const where = buildManifestFilter(filter, 1)
		if (filter.sortOrder !== undefined && filter.sortOrder !== 'ASC' && filter.sortOrder !== 'DESC') {
			throw new Error('Invalid manifest sort direction')
		}
		const direction = filter.sortOrder === 'DESC' ? 'DESC' : 'ASC'
		const sort = filter.sortBy ? `${manifestSortColumn(filter.sortBy)} ${direction}, ` : ''
		const pageOrder = pageFields
			.filter((field) => field !== filter.sortBy)
			.map((field) => `[${field}] ASC`)
			.join(', ')
		const start = 1 + where.parameters.length
		return this.repository.query(
			`${manifestSource} SELECT * FROM manifest WHERE ${where.sql}
			ORDER BY ${sort}${pageOrder} OFFSET @${start} ROWS FETCH NEXT @${start + 1} ROWS ONLY`,
			[factoryCode, ...where.parameters, (filter.page - 1) * filter.pageSize, filter.pageSize]
		)
	}

	async batch(factoryCode: string, filter: ManifestFilterDto, after?: ManifestRow): Promise<ManifestRow[]> {
		const where = buildManifestFilter(filter, 1)
		const parameters: Array<string | number | null> = [factoryCode, ...where.parameters]
		let cursor = ''
		if (after) {
			const clauses = cursorFields.map((field, index) => {
				const prefix = cursorFields.slice(0, index).map((prior) => {
					const value = after[prior]
					if (value === null) return `[${prior}] IS NULL`
					parameters.push(value)
					return `[${prior}] = @${parameters.length - 1}`
				})
				const value = after[field]
				if (value === null) prefix.push(`[${field}] IS NOT NULL`)
				else {
					parameters.push(value)
					prefix.push(`[${field}] > @${parameters.length - 1}`)
				}
				return `(${prefix.join(' AND ')})`
			})
			cursor = ` AND (${clauses.join(' OR ')})`
		}
		return this.repository.query(
			`${manifestSource} SELECT TOP (2000) * FROM manifest WHERE ${where.sql}${cursor} ORDER BY ${cursorOrder}`,
			parameters
		)
	}
}
