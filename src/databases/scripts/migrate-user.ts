import { MongoManager } from '../libs/mongoose'
import { MssqlManager } from '../libs/mssql'

import { hashSync } from 'bcrypt'
import chunk from 'lodash/chunk'
import { getArgs } from '../libs/get-args'
import { Logger } from '../utils/logger'

const args = getArgs({
	host: {
		type: 'string'
	}
})

async function main() {
	const logger = new Logger('SyncEpcMatch')
	if (!args.host) {
		logger.error('Missing required argument: --host <mssql_host>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.host)
	const mongoManager = new MongoManager()

	await mssqlManager.connect()
	await mongoManager.connect()
	try {
		const userQuery = await mssqlManager.query<{
			username: string
			password: string
			display_name: string
		}>(/* SQL */ `
		   SELECT DISTINCT user_code AS username,
								user_password AS password,
								email AS email,
								b.employee_name AS display_name
			FROM   syscloud_vn.dbo.ts_user AS a
					INNER JOIN
					syscloud_vn.dbo.ts_employee AS b
					ON a.employee_code = b.employee_code
			WHERE  a.isactive = 'Y';
		`)

		const users = userQuery.getRawMany()

		const chunkBulkWriteOps = chunk(
			users.map((item) => {
				return {
					updateOne: {
						filter: { username: item.username },
						update: {
							$setOnInsert: {
								username: item.username,
								display_name: item.display_name,
								is_system_user: item.username === 'quanghiep'
							},
							$set: {
								password: hashSync(item.password, 10)
							}
						},
						upsert: true
					}
				}
			}),
			1000
		)

		const result = await Promise.all(
			chunkBulkWriteOps.map(
				async (bulkWriteOps) =>
					await mongoManager.getRepository('users').bulkWrite(bulkWriteOps, {
						ordered: false,
						readConcern: { level: 'majority' },
						writeConcern: { w: 'majority' }
					})
			)
		)

		logger.info(
			'✅',
			result.reduce((acc, curr) => acc + curr.modifiedCount + curr.upsertedCount, 0) + ' records updated'
		)
	} catch (error) {
		logger.error(error as Error)
		process.exit(1)
	} finally {
		mssqlManager.disconnect()
		mongoManager.disconnect()
		process.exit(0)
	}
}

main()
