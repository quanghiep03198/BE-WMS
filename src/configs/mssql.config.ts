import { env } from '@common/utils'
import { DATABASE_SCHEMA } from '@databases/constants'
import { registerAs } from '@nestjs/config'
import { type TypeOrmModuleOptions } from '@nestjs/typeorm'
import path from 'node:path'

export default registerAs('mssql', (): TypeOrmModuleOptions => ({
	type: 'mssql',
	host: env('DB_HOST'),
	port: env('DB_PORT', { serialize: (value): number => Number.parseInt(value) }),
	username: env('DB_USERNAME'),
	password: env('DB_PASSWORD'),
	schema: DATABASE_SCHEMA,
	entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
	migrations: [path.join(__dirname, '..', 'databases', 'migrations', '**', '*.{ts,js}')],
	autoLoadEntities: true,
	synchronize: false,
	logging: ['error'],
	requestTimeout: 30000,
	cache: {
		type: 'redis',
		options: {
			socket: {
				host: env('REDIS_HOST'),
				port: env('REDIS_PORT', { serialize: (value): number => Number.parseInt(value) })
			},
			db: env('REDIS_DB', { fallbackValue: 0, serialize: (value): number => Number.parseInt(value) }),
			password: env('REDIS_PASSWORD')
		},
		ignoreErrors: false
	},
	pool: {
		/**
		 * * Số lượng kết nối tối đa trong pool. Thường được tính bằng số lượng lõi CPU hoặc dựa trên tải dự kiến và tài nguyên có sẵn.
		 */
		max: 24,
		/**
		 * * Số lượng kết nối tối thiểu trong pool. Giữ một số lượng kết nối tối thiểu giúp giảm độ trễ khi cần thiết lập kết nối mới, đặc biệt là trong các ứng dụng có tải cao.
		 */
		min: 5,
		/**
		 * * Thời gian tối đa (tính bằng ms) mà pool sẽ giữ một kết nối không hoạt động trước khi đóng nó. Điều này giúp quản lý tài nguyên hiệu quả, đặc biệt là trong các ứng dụng có tải thay đổi.
		 */
		idleTimeoutMillis: 30000,
		/**
		 * * Thời gian tối đa (tính bằng ms) mà pool sẽ chờ để có được một kết nối trước khi ném ra lỗi. Điều này giúp tránh tình trạng treo ứng dụng khi tất cả các kết nối đều bận.
		 */
		acquireTimeoutMillis: 30000
	},
	options: {
		trustServerCertificate: env('DB_TRUST_SERVER_CERTIFICATE', {
			serialize: (value): boolean => value === 'true'
		}),
		encrypt: false,
		enableArithAbort: true,
		connectTimeout: env('DB_CONNECTION_TIMEOUT', { serialize: (value): number => Number.parseInt(value) }),
		abortTransactionOnError: true,
		isolation: 'SNAPSHOT'
	},
	extra: {
		connectionLimit: 100,
		connectTimeout: 30000,
		acquireTimeout: 30000
	}
}))
