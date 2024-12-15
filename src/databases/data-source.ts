import env from '@/common/utils/env.util'
import { Logger } from '@nestjs/common'
import 'dotenv/config'
import { isIP } from 'net'
import { join } from 'path'
import { DataSource, DataSourceOptions } from 'typeorm'
import { type SeederOptions } from 'typeorm-extension'

const logger = new Logger('TypeORM')

const DB_HOST = env('SEEDING_DB_HOST') || env('SEEDING_DB_HOST')

if (!DB_HOST) {
	logger.error('Please provide a database host')
	process.exit()
}
if (isIP(DB_HOST.trim()) === 0) {
	logger.error('Please provide a valid IP address for the database host')
	process.exit()
}

export default new DataSource({
	host: DB_HOST,
	port: env('DB_PORT', { serialize: (value) => parseInt(value) }),
	type: env('DB_TYPE'),
	username: env('DB_USERNAME'),
	password: env('DB_PASSWORD'),
	entities: [join(__dirname, '../**/*.entity.{ts,js}'), join(__dirname, './**/*.entity.{ts,js}')],
	migrations: [join(__dirname, './migrations/*.{ts,js}')],
	seeds: [join(__dirname, './seeds/**/*.seeder.{ts,js}')],
	logging: true,
	synchronize: false,
	options: {
		trustServerCertificate: true,
		encrypt: false,
		enableArithAbort: true
	}
} as DataSourceOptions & SeederOptions)
