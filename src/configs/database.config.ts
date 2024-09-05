import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import 'dotenv/config'
import { join } from 'path'

export const defaultDataSourceOptions = {
	type: 'mssql',
	host: process.env.DB_HOST,
	port: +process.env.DB_PORT,
	username: process.env.DB_USERNAME,
	password: process.env.DB_PASSWORD,
	entities: [join(__dirname, '**', '*.entity.{ts,js}')],
	migrations: [join(__dirname, '/migrations/**/*{.ts,.js}')],
	autoLoadEntities: true,
	options: {
		trustServerCertificate: Boolean(process.env.DB_TRUST_SERVER_CERTIFICATE),
		encrypt: false,
		enableArithAbort: true
	},
	synchronize: false
} satisfies Partial<TypeOrmModuleOptions>
