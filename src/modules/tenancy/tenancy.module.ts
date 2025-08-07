import { CommonRequestHeader } from '@/common/constants'
import { Module, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { FastifyRequest } from 'fastify'
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
			useFactory: async (request: FastifyRequest, tenancyService: TenancyService) => {
				const tenancyHost = request.headers[CommonRequestHeader.TENANT_HOST] as string | undefined
				if (tenancyHost) return await tenancyService.getTenancyDataSource(tenancyHost)
			}
		}
	],
	exports: [TenancyService, TENANCY_DATA_SOURCE]
})
export class TenancyModule {}
