import { Inject, Injectable, NotFoundException, OnModuleDestroy, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { omit } from 'lodash'
import { DataSource } from 'typeorm'
import { FactoryCode } from '../department/constants'
import { Tenant } from './constants'
import { ITenancy } from './interfaces'

@Injectable({ scope: Scope.REQUEST })
export class TenancyService implements OnModuleDestroy {
	constructor(
		@Inject(REQUEST) private readonly request: Request,
		private readonly configService: ConfigService
	) {}

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
		if (typeof this.request?.dataSource?.destroy === 'function') {
			this.dataSource.destroy()
		}
	}

	public get dataSource(): DataSource {
		return this.request.dataSource
	}

	private getHostAlias(host: string) {
		return host.split('.').slice(-2).join('.')
	}

	public findOneById(id: string) {
		const tenant = this.tenants.find((tenancy) => tenancy.id === id)
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
}
