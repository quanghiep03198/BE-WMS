import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { type MongooseModuleOptions } from '@nestjs/mongoose'

export default registerAs(
	'mongodb',
	(): MongooseModuleOptions => ({
		uri: env('MONGO_URI'),
		dbName: env('MONGO_DB_NAME'),
		maxPoolSize: 100,
		connectTimeoutMS: 10000,
		readPreference: 'nearest',
		writeConcern: {
			w: 'majority'
		}
	})
)
