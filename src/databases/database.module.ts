import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm'
import { join } from 'path'

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService<NodeJS.ProcessEnv>],
			useFactory: (configService: ConfigService<NodeJS.ProcessEnv>): TypeOrmModuleOptions => {
				return {
					type: 'mssql',
					host: configService.get('DB_HOST', 'localhost'),
					port: Number(configService.get('DB_PORT', '1433')),
					username: configService.get('DB_USERNAME', 'root'),
					password: configService.get('DB_PASSWORD', ''),
					entities: [join(__dirname, '**', '*.entity.{ts,js}')],
					migrations: [join(__dirname, '/migrations/**/*{.ts,.js}')],
					autoLoadEntities: true,
					options: {
						trustServerCertificate: Boolean(configService.get('DB_TRUST_SERVER_CERTIFICATE')),
						encrypt: false,
						enableArithAbort: true
					},

					database: 'local_dev',
					synchronize: true,
					connectionTimeout: 5000
				}
			}
		})
	]
})
export class DatabaseModule {}
