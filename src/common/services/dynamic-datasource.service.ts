import { Inject, Injectable, OnModuleDestroy, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { DataSource, DataSourceOptions } from 'typeorm'

@Injectable({ scope: Scope.REQUEST })
export class DynamicDataSourceService implements OnModuleDestroy {
	private dataSource: DataSource

	constructor(
		@Inject(REQUEST) private readonly request: Request,
		private readonly configService: ConfigService
	) {
		const host = this.request.headers['X-Database-Host'] as string

		const dataSourceOptions: DataSourceOptions = this.getDataSourceOptions(host)

		this.dataSource = new DataSource(dataSourceOptions)
		this.dataSource.initialize()
	}

	private getDataSourceOptions(host: string): DataSourceOptions {
		// Dựa vào host, bạn có thể cấu hình các options khác nhau cho DataSource
		const options: DataSourceOptions = {
			type: 'mssql', // loại DBMS của bạn
			host: host,
			port: Number(this.configService.get('DB_PORT', '1433')),
			username: this.configService.get('DB_USERNAME'),
			password: this.configService.get('DB_PASSWORD'),
			synchronize: true
		}

		return options
	}

	getDataSource(): DataSource {
		return this.dataSource
	}

	async onModuleDestroy() {
		if (this.dataSource.isInitialized) {
			await this.dataSource.destroy()
		}
	}
}
