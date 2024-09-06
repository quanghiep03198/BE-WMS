import { Inject, Injectable, OnModuleDestroy, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'

export interface DynamicHostRequest extends Request {
	dataSource: DataSource
}

@Injectable({ scope: Scope.REQUEST })
export class DynamicDataSourceService implements OnModuleDestroy {
	private _dataSource: DataSource

	constructor(
		@Inject(REQUEST) private readonly request: Request,
		private readonly configService: ConfigService
	) {
		const host = this.request.headers['X-Database-Host'] as string
		this._dataSource = new DataSource({ host, ...this.configService.get<SqlServerConnectionOptions>('database') })
		this._dataSource.initialize()
	}

	public get _datasource(): DataSource {
		return this._dataSource
	}

	async onModuleDestroy() {
		if (this._dataSource.isInitialized) {
			await this._dataSource.destroy()
		}
	}
}
