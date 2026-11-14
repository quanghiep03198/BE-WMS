import { type mongo } from 'mongoose'
import cn from '../../../i18n/cn/factory.json'
import en from '../../../i18n/en/factory.json'
import vi from '../../../i18n/vi/factory.json'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const DEPARTMENTS_SQL = /* SQL */ `
	WITH assembly_cte AS (
		SELECT 'ASBL' AS [group],
			CASE WHEN dept_name LIKE N'成型%' THEN REPLACE(LEFT(dept_name, 4), N'線', N'')
				WHEN dept_name LIKE N'二廠成型%' THEN REPLACE(LEFT(dept_name, 5), N'線', N'')
				ELSE NULL END AS [name],
			dept_code AS [code],
			ROW_NUMBER() OVER (PARTITION BY REPLACE(LEFT(dept_name, 4), N'線', N'') ORDER BY dept_code DESC) AS row_num
		FROM syscloud_vn.dbo.ts_dept
		WHERE company_code = @factory
			AND (dept_code LIKE @factory + 'BA%' OR dept_code LIKE @factory + 'BS%')
			AND (dept_name LIKE N'成型[A-Z]' OR dept_name LIKE N'成型[A-Z]線'
				OR dept_name LIKE N'成型[0-9][A-Z]' OR dept_name LIKE N'二廠成型%')
	), sewing_cte AS (
		SELECT dept_name AS name, MIN(dept_code) AS code, 'SEW' AS [group]
		FROM syscloud_vn.dbo.ts_dept
		WHERE company_code = @factory AND dept_name LIKE N'%針車[0-9]%'
		GROUP BY dept_name
	)
	SELECT [group], code, name FROM assembly_cte WHERE row_num = 1 AND LEN(name) >= 3
	UNION ALL
	SELECT [group], code, name FROM sewing_cte;
`

export async function runDepartmentStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	factoryCode: string
): Promise<{ departments: number }> {
	if (!factoryCode.trim()) throw new Error('Factory code is required')
	const collection = database.collection('departments')
	await collection.createIndex({ code: 1 }, { unique: true })
	const seen = new Set<string>()
	let departments = 0
	for await (const row of streamMssqlRows(pool.request(), DEPARTMENTS_SQL, { factory: factoryCode })) {
		if (!row || typeof row !== 'object' || !('group' in row && 'code' in row && 'name' in row)) {
			throw new Error('Invalid MSSQL department row')
		}
		if (
			(row.group !== 'ASBL' && row.group !== 'SEW') ||
			typeof row.code !== 'string' ||
			!row.code.trim() ||
			typeof row.name !== 'string' ||
			!row.name.trim()
		) {
			throw new Error('Invalid MSSQL department fields')
		}
		const code = row.code.trim()
		if (seen.has(code)) throw new Error(`Duplicate department code ${code}`)
		seen.add(code)
		const name = row.name.replace(/\p{Script=Han}/gu, '').trim()
		if (!name) throw new Error(`Invalid department name after removing Chinese characters: ${code}`)
		const key = row.group === 'ASBL' ? 'assembly' : 'sewing'
		const localizedName = {
			cn: cn.departments[key].replaceAll('{name}', name),
			en: en.departments[key].replaceAll('{name}', name),
			vi: vi.departments[key].replaceAll('{name}', name)
		}
		const now = new Date()
		const result = await collection.updateOne(
			{ code },
			{
				$set: { group: row.group, name: localizedName, updated_at: now },
				$setOnInsert: { created_at: now }
			},
			{ upsert: true }
		)
		if (!result.acknowledged) throw new Error(`Unacknowledged department write: ${code}`)
		departments++
	}
	return { departments }
}
