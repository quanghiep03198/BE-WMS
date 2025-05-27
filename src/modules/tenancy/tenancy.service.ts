import { env } from '@/common/utils'
import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { omit } from 'lodash'
import { join } from 'path'
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
			id: Tenant.MAIN,
			factory: [FactoryCode.GL1, FactoryCode.GL2, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_MAIN'),
			alias: this.getHostAlias(this.configService.get('TENANT_MAIN'))
		},
		{
			id: Tenant.VN_LIANYING,
			factory: [FactoryCode.GL1, FactoryCode.GL2],
			host: this.configService.get('TENANT_VN_LIANYING'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANYING'))
		},

		{
			id: Tenant.VN_LIANSHUN,
			factory: FactoryCode.GL3,
			host: this.configService.get('TENANT_VN_LIANSHUN'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANSHUN'))
		},
		{
			id: Tenant.KM_KHRU,
			factory: FactoryCode.GL4,
			host: this.configService.get<string>('TENANT_KHRU'),
			alias: this.getHostAlias(this.configService.get('TENANT_KHRU'))
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
				return env('NODE_ENV') === 'production' ? tenant.id !== Tenant.DEV && tenant.id !== Tenant.MAIN : true
			})
			.map((tenant) => omit(tenant, ['host']))
	}

	public getByFactory(factoryCode: FactoryCode) {
		const isProduction = env('NODE_ENV') === 'production'
		const matchedTenant = this.tenants.find((tenant) => {
			return (
				tenant.factory.includes(factoryCode) &&
				(isProduction ? tenant.id !== Tenant.DEV && tenant.id !== Tenant.MAIN : true)
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
