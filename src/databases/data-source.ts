import { env } from '@/common/utils'
import 'dotenv/config'
import { join } from 'path'
import { DataSource, DataSourceOptions } from 'typeorm'
import { type SeederOptions } from 'typeorm-extension'

export default new DataSource({
	host: env('DB_HOST'),
	port: env('DB_PORT', { serialize: (value) => parseInt(value) }),
	type: env('DB_TYPE'),
	username: env('DB_USERNAME'),
	password: env('DB_PASSWORD'),
	schema: 'dbo',
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
