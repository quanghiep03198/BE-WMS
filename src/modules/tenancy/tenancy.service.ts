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
			factories: [FactoryCode.GL1, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_DEV'),
			alias: this.getHostAlias(this.configService.get('TENANT_DEV')),
			active: true
		},
		{
			id: Tenant.MAIN_21,
			factories: [FactoryCode.GL1, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_MAIN_21'),
			alias: this.getHostAlias(this.configService.get('TENANT_MAIN_21')),
			active: true
		},
		{
			id: Tenant.VN_LIANYING_PRIMARY,
			factories: [FactoryCode.GL1],
			host: this.configService.get('TENANT_VN_LIANYING_PRIMARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANYING_PRIMARY')),
			active: true
		},
		{
			id: Tenant.VN_LIANYING_SECONDARY,
			factories: [FactoryCode.GL1],
			host: this.configService.get('TENANT_VN_LIANYING_SECONDARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANYING_SECONDARY')),
			active: false
		},
		{
			id: Tenant.VN_LIANSHUN_PRIMARY,
			factories: [FactoryCode.GL3],
			host: this.configService.get('TENANT_VN_LIANSHUN_PRIMARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANSHUN_PRIMARY')),
			active: true
		},
		{
			id: Tenant.VN_LIANSHUN_SECONDARY,
			factories: [FactoryCode.GL3],
			host: this.configService.get('TENANT_VN_LIANSHUN_SECONDARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_VN_LIANSHUN_SECONDARY')),
			active: false
		},
		{
			id: Tenant.KM_PRIMARY,
			factories: [FactoryCode.GL4],
			host: this.configService.get<string>('TENANT_KM_PRIMARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_KM_PRIMARY')),
			active: true
		},
		{
			id: Tenant.KM_SECONDARY,
			factories: [FactoryCode.GL4],
			host: this.configService.get('TENANT_KM_SECONDARY'),
			alias: this.getHostAlias(this.configService.get('TENANT_KM_SECONDARY')),
			active: false
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

	public getAll(): Array<Omit<ITenancy, 'host' | 'active'>> {
		return this.tenants
			.filter((tenant) => {
				return (
					tenant.active &&
					(env('NODE_ENV') === 'production' ? tenant.id !== Tenant.DEV && tenant.id !== Tenant.MAIN_21 : true)
				)
			})
			.map((tenant) => omit(tenant, ['host', 'active']))
	}

	public getByFactory(factoryCode: FactoryCode) {
		const matchTenants = this.tenants.filter((tenant) => {
			return (
				tenant.active &&
				tenant.factories.includes(factoryCode) &&
				(env('NODE_ENV') === 'production' ? tenant.id !== Tenant.DEV && tenant.id !== Tenant.MAIN_21 : true)
			)
		})
		if (matchTenants.length === 0) throw new NotFoundException('No available tenant')
		return matchTenants.map((tenant) => omit(tenant, ['host', 'active']))
	}

	/**
	 * @deprecated
	 */
	public getDefaultTenantByFactory(factoryCode: FactoryCode) {
		const tenant = this.tenants.find((tenant) => tenant.factories.includes(factoryCode) && tenant.active)
		if (!tenant) throw new NotFoundException('No available tenant')
		return omit(tenant, ['host', 'active'])
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
