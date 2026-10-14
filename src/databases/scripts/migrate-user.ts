import { hashSync } from 'bcrypt'
import type { AnyBulkWriteOperation } from 'mongoose'
import { isIPv4 } from 'net'
import { IUser } from '../../modules/user/domain/interfaces'
import type { UserDocument } from '../../modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	mssqlHost: {
		type: 'string',
		description: 'MSSQL host'
	},
	mongoDbName: {
		type: 'string',
		description: 'MongoDB database name'
	}
})

async function main() {
	const logger = new Logger('MigrateUserData')

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error('Missing required argument: --host <mssql_host>')
		process.exit(1)
	}
	if (typeof args.mongoDbName !== 'string') {
		logger.error('Missing required argument: --host <mssql_host>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	await mssqlManager.connect()
	await mongoManager.connect()
	try {
		const request = mssqlManager.pool.request()

		request.stream = true

		let batch: Array<AnyBulkWriteOperation<UserDocument>> = []
		let totalProcessed = 0
		const BATCH_SIZE = 1000

		request.on('row', async (row: IUser) => {
			batch.push({
				updateOne: {
					filter: { username: row.username },
					update: {
						$setOnInsert: {
							username: row.username,
							display_name: row.display_name,
							is_system_user: row.username === 'quanghiep'
						},
						$set: {
							password: hashSync(row.password, 10)
						}
					},
					upsert: true
				}
			})

			if (batch.length >= BATCH_SIZE) {
				request.pause()
				try {
					await mongoManager.getRepository<UserDocument>('users').bulkWrite(batch)
					totalProcessed += batch.length
					logger.info(`Synchronized ${totalProcessed} rows`)
					batch = [] // Reset batch
				} catch (error) {
					logger.error(error)
				}
				request.resume()
			}
		})

		request.on('error', (error) => logger.error(error))
		request.on('done', () => logger.info(`Finished processing all rows. Total processed: ${totalProcessed}`))

		await request.query<{
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
