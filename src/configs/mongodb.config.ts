import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { type MongooseModuleOptions } from '@nestjs/mongoose'

export const MONGODB_CONFIG_TOKEN = Symbol('mongodb')

export default registerAs(MONGODB_CONFIG_TOKEN, (): MongooseModuleOptions => ({
	uri: env('MONGO_URI', { fallbackValue: 'mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019' }),
	dbName: env('MONGO_DB_NAME', { fallbackValue: 'data_warehouse' }),
	replicaSet: env('MONGO_REPLICA_SET', { fallbackValue: 'rs0' }),
	maxPoolSize: 24,
	connectTimeoutMS: 10000,
	readPreference: 'secondaryPreferred', // * Prefer reading from secondary nodes in a replica set.
	writeConcern: {
		/**
		 * * Yêu cầu dữ liệu phải được ghi thành công trên đa số các node có quyền bỏ phiếu trong cụm.
		 * * Ví dụ: Cụm có 3 node thì cần ít nhất 2 node ghi thành công)
		 */
		w: 'majority',
		/**
		 * * Bắt buộc MongoDB phải ghi dữ liệu vào tệp Journal (nhật ký trên ổ đĩa vật lý) trước khi báo thành công.
		 * * Điều này giúp phòng hờ trường hợp server bị mất nguồn điện đột ngột (mất điện sập nguồn), khi khởi động lại, MongoDB có thể khôi phục lại từ file Journal.
		 */
		journal: true
	}
	// autoIndex: env<RuntimeEnvironment>('NODE_ENV') === 'development'
}))
