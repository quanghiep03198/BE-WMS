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
			factories: [FactoryCode.GL1, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_DEV'),
			alias: this.getHostAlias(this.configService.get('TENANT_DEV'))
		},
		{
			id: Tenant.MAIN,
			factories: [FactoryCode.GL1, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_MAIN'),
			alias: this.getHostAlias(this.configService.get('TENANT_MAIN'))
		},
		{
			id: Tenant.VN_LIANYING_PRIMARY,
			factories: [FactoryCode.GL1],
			default: true,
			host: this.configService.get('TENANT_VN_LIANYING_PRIMARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANYING_PRIMARY'))
		},
		{
			id: Tenant.VN_LIANYING_SECONDARY,
			factories: [FactoryCode.GL1],
			host: this.configService.get('TENANT_VN_LIANYING_SECONDARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANYING_SECONDARY'))
		},
		{
			id: Tenant.VN_LIANSHUN_PRIMARY,
			default: true,
			factories: [FactoryCode.GL3],
			host: this.configService.get('TENANT_VN_LIANSHUN_PRIMARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANSHUN_PRIMARY'))
		},
		{
			id: Tenant.VN_LIANSHUN_SECONDARY,
			factories: [FactoryCode.GL3],
			host: this.configService.get('TENANT_VN_LIANSHUN_SECONDARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANSHUN_SECONDARY'))
		},
		{
			id: Tenant.KM_PRIMARY,
			default: true,
			factories: [FactoryCode.GL4],
			host: this.configService.get<string>('TENANT_KM_PRIMARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_KM_PRIMARY'))
		},
		{
			id: Tenant.KM_SECONDARY,
			factories: [FactoryCode.GL4],
			host: this.configService.get('TENANT_KM_SECONDARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_KM_SECONDARY'))
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

	public getTenantsByFactory(factoryCode: FactoryCode) {
		const matchTenants = this.tenants.filter((tenant) => tenant.factories.includes(factoryCode))
		if (matchTenants.length === 0) throw new NotFoundException('No available tenant')
		return matchTenants.map((tenant) => omit(tenant, 'host'))
	}

	public getDefaultTenantByFactory(factoryCode: FactoryCode) {
		const tenant = this.tenants.find((tenant) => tenant.factories.includes(factoryCode) && tenant.default)
		if (!tenant) throw new NotFoundException('No available tenant')
		return omit(tenant, 'host')
	}

	public async getDataSourceByHost(host: string) {
		if (!this.dataSources.has(host)) {
			const dataSource = new DataSource({
				...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
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
