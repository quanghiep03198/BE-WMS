import { Languages } from '@common/constants'
import { env } from '@common/utils'
import { isIPv4 } from 'net'
import { DepartmentDocument } from './../../modules/department/schemas/department.schema'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	mssqlHost: {
		type: 'string',
		default: env('DB_HOST')
	},
	mongoDbName: {
		type: 'string',
		default: env('MONGO_DB_NAME')
	},
	tenant: {
		type: 'string',
		default: env('APP_TENANCY')
	}
})

async function execute() {
	const logger = new Logger()

	if (!args.mssqlHost || !isIPv4(args.mssqlHost)) {
		logger.error('Invalid MSSQL host')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string' || args.mongoDbName.trim() === '') {
		logger.error('Invalid MongoDB database name')
		process.exit(1)
	}

	if (!args.tenant || !['VA1', 'VB2', 'CA1'].includes(args.tenant)) {
		logger.error('Invalid tenant')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const query = await mssqlManager.query<{
			group: DepartmentDocument['group']
			code: string
			name: string
		}>(/* SQL */ `
        DECLARE @FactoryCode AS VARCHAR (5) = '${args.tenant}';

         WITH   assembly_cte
         AS     (SELECT 'ASBL' AS [group],
                        CASE WHEN dept_name LIKE '成型%' THEN REPLACE(LEFT(dept_name, 4), '線', '') WHEN dept_name LIKE '二廠成型%' THEN REPLACE(LEFT(dept_name, 5), '線', '') ELSE NULL END AS [name],
                        dept_code AS [code],
                        ROW_NUMBER() OVER (PARTITION BY REPLACE(LEFT(dept_name, 4), '線', '') ORDER BY dept_code DESC) AS [row_num]
               FROM   syscloud_vn.dbo.ts_dept
               WHERE  company_code = @FactoryCode
                        AND (dept_code LIKE @FactoryCode + 'BA%'
                           OR dept_code LIKE @FactoryCode + 'BS%')
                        AND (dept_name LIKE '成型[A-Z]'
                           OR dept_name LIKE '成型[A-Z]線'
                           OR dept_name LIKE '成型[0-9][A-Z]'
                           OR dept_name LIKE '二廠成型%')),
               reduced_assembly_cte
         AS     (SELECT [group],
                        [name],
                        [code]
               FROM   assembly_cte
               WHERE  row_num = 1
                        AND len([name]) >= 3),
               reduced_sewing_cte
         AS     (SELECT   DISTINCT dept_name AS name,
                                 min(dept_code) AS code,
                                 'SEW' AS [group]
               FROM     syscloud_vn.dbo.ts_dept
               WHERE    company_code = @FactoryCode
                        AND (dept_name LIKE '%針車[0-9]%')
               GROUP BY dept_name)
         SELECT [group],
               [code],
               [name]
         FROM   reduced_assembly_cte
         UNION ALL
         SELECT [group],
               [code],
               [name]
         FROM   reduced_sewing_cte;
   `)

		const departments = query.getRawMany()

		const result = await mongoManager.getRepository<DepartmentDocument>('departments').bulkWrite(
			departments.map((dept) => ({
				updateOne: {
					filter: { group: dept.group, code: dept.code },
					update: {
						$set: {
							group: dept.group,
							code: dept.code,
							name: Object.values(Languages).reduce<DepartmentDocument['name']>(
								(acc, lang) => ({ ...acc, [lang]: dept.name }),
								{} as DepartmentDocument['name']
							)
						}
					},
					upsert: true
				}
			}))
		)

		logger.info(`Migrated ${result.modifiedCount} departments, upserted ${result.upsertedCount} departments.`)
	} catch (error) {
		process.exitCode = 1
		logger.error(error as Error)
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(process.exitCode || 0)
	}
}

execute()
