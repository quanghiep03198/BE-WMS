import { Module, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { TENANCY_DATASOURCE } from './constants'
import { TenancyController } from './tenancy.controller'
import { TenancyService } from './tenancy.service'

@Module({
	controllers: [TenancyController],
	providers: [
		TenancyService,

		{
			provide: TENANCY_DATASOURCE,
			scope: Scope.REQUEST,
			inject: [REQUEST, TenancyService],

			useFactory: async (request: Request, tenancyService: TenancyService) => {
				const { tenancyHost } = request
				if (tenancyHost) return await tenancyService.getDataSourceByHost(tenancyHost)
			}
		}
	],
	exports: [TenancyService, TENANCY_DATASOURCE]
})
export class TenancyModule {}
