import { config } from 'dotenv'
import sql from 'mssql'
import { ManifestRepository, ManifestRow } from '../repositories/manifest.repository'

const integration = process.env.RUN_MANIFEST_SQL_TESTS === '1' ? it : it.skip

describe('manifest query on local SQL Server', () => {
	integration(
		'matches list and keyset export across batches and duplicate source keys',
		async () => {
			config({ quiet: true })
			const pool = new sql.ConnectionPool({
				server: '127.0.0.1',
				port: 1433,
				user: process.env.DB_USERNAME,
				password: process.env.DB_PASSWORD,
				database: 'master',
				options: { encrypt: false, trustServerCertificate: true }
			})
			await pool.connect()
			const transaction = new sql.Transaction(pool)
			await transaction.begin()
			try {
				await new sql.Request(transaction).batch(`
				CREATE TABLE #PackingPlan (
					keyid INT, po VARCHAR(20), Size VARCHAR(100), Factory_code VARCHAR(100),
					Series_number NVARCHAR(50), Weight FLOAT, Actual_weight_in FLOAT, created DATETIME
				);
				CREATE TABLE #OrderProcess (
					po VARCHAR(20), brand NVARCHAR(50), shoestyle_codefactory NVARCHAR(50),
					shoestyle_codecust NVARCHAR(50), shoestyle_namecust NVARCHAR(50), color_sn NVARCHAR(50)
				);
				WITH sequence AS (
					SELECT TOP (2005) ROW_NUMBER() OVER (ORDER BY a.object_id, b.object_id) AS n
					FROM sys.all_objects a CROSS JOIN sys.all_objects b
				)
				INSERT #PackingPlan
				SELECT n, CONCAT('P', RIGHT(CONCAT('00000', n), 5)), '#10(1)', 'GL1',
					CONCAT('S', n), 2.5, 2.7, '2026-01-01'
				FROM sequence;
				INSERT #OrderProcess
				SELECT po, 'Brand', 'FactoryStyle', 'A', 'Style', 'Blue' FROM #PackingPlan;
				INSERT #OrderProcess VALUES ('P00001', 'Brand', 'FactoryStyle', 'B', 'Style', 'Blue');
				UPDATE #OrderProcess SET brand = NULL WHERE po = 'P00002';
				INSERT #PackingPlan VALUES (3000, 'P%_[', '#10(1)', 'GL1', 'SPECIAL', 2.5, 2.7, '2026-01-01');
				INSERT #OrderProcess VALUES ('P%_[', 'Brand', 'FactoryStyle', 'A', 'Style', 'Blue');
			`)
				const query = async (statement: string, parameters: Array<string | number>) => {
					const request = new sql.Request(transaction)
					parameters.forEach((value, index) => request.input(String(index), value))
					const adapted = statement
						.replaceAll('DV_DATA_LAKE.dbo.PackingPlan', '#PackingPlan')
						.replaceAll('DV_DATA_LAKE.dbo.dv_OrderProcessR05', '#OrderProcess')
						.replace(
							/WITH\s*\(\s*NOLOCK\s*,\s*INDEX\s*\(\s*IX_PackingPlan_(?:po_size_factory|factory_po_size)\s*\)\s*\)/g,
							''
						)
					return (await request.query(adapted)).recordset
				}
				const repository = new ManifestRepository({ query } as never)
				const filter = { po: 'P0' }
				const total = await repository.count('VA1', filter)
				expect(total).toBe(2006)
				for (const sortBy of ['cust_shoes_style', 'brand_name', 'factory_shoes_style', 'color_sn'] as const) {
					expect(
						await repository.page('VA1', { ...filter, page: 1, pageSize: 20, sortBy, sortOrder: 'DESC' })
					).toHaveLength(20)
				}
				expect(await repository.count('VA1', { po: '%_[' })).toBe(1)
				expect(await repository.count('VA1', { cust_shoes_style: 'B/Style', target_box_qtyFrom: 1 })).toBe(1)
				expect(await repository.count('VA1', { poEq: 'P00001', target_box_qtyEq: 1 })).toBe(2)
				expect(await repository.count('VA1', { q: 'P%_[' })).toBe(1)
				const listed: ManifestRow[] = []
				for (let page = 1; page <= Math.ceil(total / 100); page++) {
					listed.push(
						...(await repository.page('VA1', { ...filter, page, pageSize: 100, sortBy: 'po', sortOrder: 'ASC' }))
					)
				}
				let after: ManifestRow | undefined
				const exported: ManifestRow[] = []
				for (;;) {
					const rows = await repository.batch('VA1', filter, after)
					if (!rows.length) break
					exported.push(...rows)
					after = rows[rows.length - 1]
				}
				expect(listed).toHaveLength(total)
				expect(exported).toHaveLength(total)
				const key = (row: ManifestRow) => `${row.cust_shoes_style}:${row.cursor_id}`
				expect(new Set(exported.map(key)).size).toBe(total)
				expect(new Set(listed.map(key))).toEqual(new Set(exported.map(key)))
				expect(
					exported
						.filter((row) => row.po === 'P00001')
						.map((row) => row.cust_shoes_style)
						.sort()
				).toEqual(['A/Style', 'B/Style'])
				const nullCursor = exported.find((row) => row.po === 'P00002')
				expect(nullCursor.brand_name).toBeNull()
				expect((await repository.batch('VA1', filter, nullCursor))[0].po).toBe('P00003')
			} finally {
				await transaction.rollback()
				await pool.close()
			}
		},
		120000
	)
})
