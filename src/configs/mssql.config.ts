import { env } from '@common/utils'
import { DATABASE_SCHEMA } from '@databases/constants'
import { InvDefectiveGoods1757390824605 } from '@databases/migrations/1757390824605-inv_defective_goods'
import { TruckloadDelivery1762756390180 } from '@databases/migrations/1762756390180-truckload-delivery'
import { Users1768439528524 } from '@databases/migrations/1768439528524-users'
import { RefreshTokens1769534028893 } from '@databases/migrations/1769534028893-refresh-tokens'

import { registerAs } from '@nestjs/config'
import { type TypeOrmModuleOptions } from '@nestjs/typeorm'

export default registerAs('mssql', (): TypeOrmModuleOptions => ({
	type: 'mssql',
	host: env('DB_HOST'),
	port: env('DB_PORT', { serialize: (value): number => Number.parseInt(value) }),
	username: env('DB_USERNAME'),
	password: env('DB_PASSWORD'),
	schema: DATABASE_SCHEMA,
	migrations: [
		InvDefectiveGoods1757390824605,
		TruckloadDelivery1762756390180,
		Users1768439528524,
		RefreshTokens1769534028893
	],
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
		isolation: 'SNAPSHOT' // * Đặt mức độ cô lập mặc định cho các giao dịch. SNAPSHOT giúp giảm khả năng bị deadlock và cải thiện hiệu suất trong các môi trường có nhiều giao dịch đồng thời.
	},
	extra: {
		connectionLimit: 100,
		connectTimeout: 30000,
		acquireTimeout: 30000
	}
}))
