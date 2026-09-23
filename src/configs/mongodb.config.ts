import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { type MongooseModuleOptions } from '@nestjs/mongoose'

export const MONGODB_CONFIG_TOKEN = Symbol('mongodb')

export default registerAs(MONGODB_CONFIG_TOKEN, (): MongooseModuleOptions => ({
	uri: env('MONGO_URI'),
	dbName: env('MONGO_DB_NAME'),
	maxPoolSize: 24,
	connectTimeoutMS: 10000,
	readPreference: 'secondaryPreferred', // * Prefer reading from secondary nodes in a replica set.
	writeConcern: {
		w: 'majority'
	}
}))
