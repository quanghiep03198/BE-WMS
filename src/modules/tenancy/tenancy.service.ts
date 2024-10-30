import { Tenant } from '@/common/constants'
import { CAMBODIA_FACTORY_CODE, VIETNAM_FACTORY_CODE } from '@/common/constants/regex'
import { Inject, Injectable, NotFoundException, OnModuleDestroy, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { DataSource } from 'typeorm'
import { FactoryCode } from '../department/constants'
import { ITenancy } from './tenancy.interface'

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
			host: this.configService.get('TENANT_DEV')
		},
		{
			id: Tenant.MAIN,
			factories: [FactoryCode.GL1, FactoryCode.GL3, FactoryCode.GL4],
			host: this.configService.get('TENANT_MAIN')
		},
		{
			id: Tenant.VN_LIANYING_PRIMARY,
			factories: [FactoryCode.GL1],
			host: this.configService.get('TENANT_VN_LIANYING_PRIMARY')
		},
		{
			id: Tenant.VN_LIANYING_SECONDARY,
			factories: [FactoryCode.GL1],
			host: this.configService.get('TENANT_VN_LIANYING_SECONDARY')
		},
		{
			id: Tenant.VN_LIANSHUN_2,
			factories: [FactoryCode.GL3],
			host: this.configService.get('TENANT_VN_LIANSHUN_2')
		},
		{
			id: Tenant.KM_1,
			factories: [FactoryCode.GL4],
			host: this.configService.get<string>('TENANT_KM_PRIMARY')
		},
		{
			id: Tenant.KM_2,
			factories: [FactoryCode.GL4],
			host: this.configService.get('TENANT_KM_SECONDARY')
		}
	]

	onModuleDestroy() {
		if (this.dataSource && typeof this.dataSource.destroy === 'function') {
			this.dataSource.destroy()
		}
	}

	public get dataSource(): DataSource {
		return this.request.dataSource
	}

	public findOneById(id: string) {
		const tenant = this.tenants.find((tenancy) => tenancy.id === id)
		if (!tenant) throw new NotFoundException('No available tenant')
		return tenant
	}

	public getTenantsByFactory(factoryCode: FactoryCode) {
		return (() => {
			switch (true) {
				case VIETNAM_FACTORY_CODE.test(factoryCode):
					return this.tenants.filter((tenant) => tenant.factories.includes(factoryCode))
				case CAMBODIA_FACTORY_CODE.test(factoryCode):
					return this.tenants.filter((tenant) => tenant.factories.includes(factoryCode))
				// * Add more case if there still have other reader hosts
				default:
					throw new NotFoundException('No available tenant')
			}
		})()
	}
}
