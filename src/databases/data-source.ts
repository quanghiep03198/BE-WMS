import 'dotenv/config'
import { join, resolve } from 'path'
import { DataSource, DataSourceOptions } from 'typeorm'
import { SeederOptions } from 'typeorm-extension'
import { rfidCustomerFactory } from './seeders/rfid/rfid-customer.factory'

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
	factories: [rfidCustomerFactory],
	seeds: [],
	options: {
		trustServerCertificate: true,
		encrypt: false,
		enableArithAbort: true
	}
} as DataSourceOptions & SeederOptions)
