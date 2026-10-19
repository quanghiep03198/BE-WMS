import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { type MongooseModuleOptions } from '@nestjs/mongoose'

export const MONGODB_CONFIG_TOKEN = Symbol('mongodb')

export default registerAs(MONGODB_CONFIG_TOKEN, (): MongooseModuleOptions => ({
	uri: env('MONGO_URI', { fallbackValue: 'mongodb://localhost:27017,localhost:27018,localhost:27019' }),
	dbName: env('MONGO_DB_NAME', { fallbackValue: 'data_warehouse' }),
	replicaSet: env('MONGO_REPLICA_SET', { fallbackValue: 'rs0' }),
	maxPoolSize: 24,
	connectTimeoutMS: 10000,
	readPreference: 'secondaryPreferred', // * Prefer reading from secondary nodes in a replica set.
	writeConcern: {
		w: 'majority'
	}
}))
