import { RFIDDeviceType } from '@modules/rfid-device/domain/constants'
import { NVarChar } from 'mssql'
import { isIPv4 } from 'net'
import { RFIDDeviceDocument } from '../../modules/rfid-device/infrastructure/persistence/mongodb/schemas/rfid-device.schema'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	mssqlHost: {
		type: 'string',
		description: 'MSSQL host',
		default: process.env.DB_HOST
	},
	mongoDbName: {
		type: 'string',
		description: 'MongoDB database name',
		default: process.env.MONGO_DB_NAME
	},
	tenant: {
		type: 'string',
		description: 'Factory code',
		default: process.env.FACTORY_CODE
	}
})

async function execute() {
	let exitCode = 0
	const logger = new Logger('SyncRfidDevices')

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error('Invalid MSSQL host')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string' || args.mongoDbName.trim() === '') {
		logger.error('Invalid MongoDB database name')
		process.exit(1)
	}

	if (typeof args.tenant !== 'string' || !['VA1', 'VB2', 'CA1'].includes(args.tenant.trim())) {
		logger.error('Invalid factory code')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const query = await mssqlManager.query<{
			device_sn: string
			station_no: string
			'device_name.vn': string
			'device_name.en': string
			'device_name.cn': string
			tcp_ip: string
			tcp_port: string
			device_type: RFIDDeviceType
		}>(
			/* SQL */ `
            SELECT DISTINCT device_sn,
                           device_name AS station_no,
                           Vietnamese AS 'device_name.vn',
                           English AS 'device_name.en',
                           TraditionalChinese AS 'device_name.cn',
                           ip_address AS tcp_ip,
                           ip_port AS tcp_port,
                           CASE WHEN device_ant IS NULL
                                    OR device_ant = '0' THEN 'handhold' ELSE 'antenna' END AS device_type
            FROM   DV_DATA_LAKE.dbo.dv_rfidreader
            WHERE  device_name LIKE 'CUS_%_WH%'
                  AND cofactory_code = @factory; 
         `,
			{ factory: { type: NVarChar(10), value: args.tenant } }
		)

		const devices = query.getRawMany()

		const result = await mongoManager.getRepository<RFIDDeviceDocument>('rfid_devices').bulkWrite(
			devices.map((item) => ({
				updateOne: {
					filter: { device_sn: item.device_sn },
					update: { $set: item },
					upsert: true
				}
			}))
		)

		logger.info(`Migrated ${result.modifiedCount} RFID devices, upserted ${result.upsertedCount} RFID devices.`)
	} catch (error) {
		logger.error(error)
		exitCode = 1
	} finally {
		await Promise.all([mssqlManager.disconnect(), mongoManager.disconnect()])
		process.exit(exitCode)
	}
}

execute()
