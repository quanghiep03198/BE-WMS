import { Module, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Request } from 'express'
import { TENANCY_DATA_SOURCE } from './constants'
import { TenancyController } from './tenancy.controller'
import { TenancyService } from './tenancy.service'

@Module({
	controllers: [TenancyController],
	providers: [
		TenancyService,
		{
			provide: TENANCY_DATA_SOURCE,
			scope: Scope.REQUEST,
			inject: [REQUEST, TenancyService],
			useFactory: async (request: Request, tenancyService: TenancyService) => {
				const { tenancyHost } = request
				if (tenancyHost) return await tenancyService.getTenancyDataSource(tenancyHost)
			}
		}
	],
	exports: [TenancyService, TENANCY_DATA_SOURCE]
})
export class TenancyModule {}
