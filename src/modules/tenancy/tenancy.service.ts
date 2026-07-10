import { env } from '@common/utils'
import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { omit } from 'lodash'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { FactoryCode } from '../department/constants'
import { Tenant } from './constants'
import { ITenancy } from './interfaces'

@Injectable()
export class TenancyService implements OnModuleDestroy {
	private dataSources: Map<string, DataSource> = new Map()

	constructor(private readonly configService: ConfigService) {}

	private readonly tenants: Array<ITenancy> = [
		{
			id: Tenant.DEV,
			factory: [FactoryCode.GL1, FactoryCode.GL2, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_DEV'),
			alias: this.getHostAlias(this.configService.get('TENANT_DEV'))
		},
		{
			id: Tenant.CENTRAL,
			factory: [FactoryCode.GL1, FactoryCode.GL2, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_CENTRAL'),
			alias: this.getHostAlias(this.configService.get('TENANT_CENTRAL'))
		},
		{
			id: Tenant.GL1,
			factory: [FactoryCode.GL1, FactoryCode.GL2],
			host: this.configService.get('TENANT_GL1'),
			alias: this.getHostAlias(this.configService.get('TENANT_GL1'))
		},

		{
			id: Tenant.GL3,
			factory: FactoryCode.GL3,
			host: this.configService.get('TENANT_GL3'),
			alias: this.getHostAlias(this.configService.get('TENANT_GL3'))
		},
		{
			id: Tenant.GL4,
			factory: FactoryCode.GL4,
			host: this.configService.get<string>('TENANT_GL4'),
			alias: this.getHostAlias(this.configService.get('TENANT_GL4'))
		}
	]

	onModuleDestroy() {
		for (const dataSource of this.dataSources.values()) {
			if (dataSource.isInitialized) {
				dataSource.destroy()
			}
		}
		this.dataSources.clear()
	}

	private getHostAlias(host: string) {
		return host.split('.').slice(-2).join('.')
	}

	public findOneById(tenantId: string) {
		const tenant = this.tenants.find((tenancy) => tenancy.id === tenantId)
		if (!tenant) throw new NotFoundException('No available tenant')
		return tenant
	}

	public getAll(): Array<Omit<ITenancy, 'host'>> {
		return this.tenants
			.filter((tenant) => {
				return env('NODE_ENV') === 'production' ? tenant.id !== Tenant.DEV && tenant.id !== Tenant.CENTRAL : true
			})
			.map((tenant) => omit(tenant, ['host']))
	}

	public getByFactory(factoryCode: FactoryCode) {
		const isProduction = env('NODE_ENV') === 'production'
		const matchedTenant = this.tenants.find((tenant) => {
			return (
				tenant.factory.includes(factoryCode) &&
				(isProduction ? tenant.id !== Tenant.DEV && tenant.id !== Tenant.CENTRAL : true)
			)
		})
		if (!matchedTenant) throw new NotFoundException('No available tenant')
		if (!isProduction) return this.tenants.find((tenant) => tenant.id === Tenant.DEV)
		else return matchedTenant
	}

	public async getTenancyDataSource(host: string) {
		if (!this.dataSources.has(host)) {
			const dataSource = new DataSource({
				...this.configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
				entities: [join(__dirname, '../**/*.entity.{ts,js}')],
				host: host
			})
			this.dataSources.set(host, dataSource)
		}
		const dataSource = this.dataSources.get(host)
		if (!dataSource.isInitialized) await dataSource.initialize()
		return dataSource
	}
}
