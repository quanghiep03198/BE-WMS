import { Tenant } from '@/common/constants'
import { CAMBODIA_FACTORY_CODE, VIETNAM_FACTORY_CODE } from '@/common/constants/regex'
import { Inject, Injectable, NotFoundException, OnModuleDestroy, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { DataSource } from 'typeorm'
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
			location: 'Vietnam',
			host: this.configService.get('TENANT_DEV')
		},
		{
			id: Tenant.MAIN,
			location: 'Vietnam',
			host: this.configService.get('TENANT_MAIN')
		},
		{
			id: Tenant.VN_PRIAMRY,
			location: 'Vietnam',
			host: this.configService.get('TENANT_VN_PRIMARY')
		},
		{
			id: Tenant.VN_SECONDARY,
			location: 'Vietnam',
			host: this.configService.get('TENANT_VN_SECONDARY')
		},
		{
			id: Tenant.KM_PRIMARY,
			location: 'Cambodia',
			host: this.configService.get('TENANT_KM_PRIMARY')
		},
		{
			id: Tenant.KM_SECONDARY,
			location: 'Cambodia',
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

	public getOneById(id: string) {
		const tenant = this.tenants.find((tenancy) => tenancy.id === id)
		if (!tenant) throw new NotFoundException('No available tenant')
		return tenant
	}

	public getTenantsByFactory(cofactoryCode: string) {
		return (() => {
			switch (true) {
				case VIETNAM_FACTORY_CODE.test(cofactoryCode):
					return this.tenants.filter((tenancy) => tenancy.location === 'Vietnam')
				case CAMBODIA_FACTORY_CODE.test(cofactoryCode):
					return this.tenants.filter((tenancy) => tenancy.location === 'Cambodia')
				// * Add more case if there still have other reader hosts
				default:
					throw new NotFoundException('No available tenant')
			}
		})()
	}
}
