import 'dotenv/config'
import { join, resolve } from 'path'
import { DataSource, DataSourceOptions } from 'typeorm'

export default new DataSource({
	type: process.env.DB_TYPE,
	host: process.env.DB_HOST,
	port: +process.env.DB_PORT,
	username: process.env.DB_USERNAME,
	password: process.env.DB_PASSWORD,
	entities: [resolve(join(__dirname, '../**/*.entity{.ts,.js}'))],
	migrations: [resolve(join(__dirname, './migrations/*.{ts,js}'))],
	subscribers: [resolve(join(__dirname, '../**/*.subscriber{.ts,.js}'))],
	logging: true,
	synchronize: true,
	options: {
		trustServerCertificate: true,
		encrypt: false,
		enableArithAbort: true
	}
} as DataSourceOptions)
