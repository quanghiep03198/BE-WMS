import { Databases, DataSources } from '@/common/constants/global.enum'
import { defaultDataSourceOptions } from '@/configs/database.config'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

@Module({
	imports: [
		TypeOrmModule.forRoot({
			name: DataSources.DATALAKE,
			database: Databases.DATALAKE,
			...defaultDataSourceOptions
		}),
		TypeOrmModule.forRoot({
			name: DataSources.SYSCLOUD,
			database: Databases.SYSCLOUD,
			...defaultDataSourceOptions
		}),
		TypeOrmModule.forRoot({
			name: DataSources.ERP,
			database: Databases.ERP,
			...defaultDataSourceOptions
		})
	]
})
export class DatabaseModule {}
