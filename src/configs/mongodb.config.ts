import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { type MongooseModuleOptions } from '@nestjs/mongoose'

export default registerAs('mongodb', (): MongooseModuleOptions => ({
	uri: env('MONGO_URI'),
	dbName: env('MONGO_DB_NAME'),
	maxPoolSize: 24,
	connectTimeoutMS: 10000,
	readPreference: 'nearest', // * Đặt readPreference để đọc dữ liệu từ node gần nhất, giúp giảm độ trễ và cải thiện hiệu suất đọc trong các cụm MongoDB.
	writeConcern: {
		w: 'majority'
	}
}))
