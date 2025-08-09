import { CommonRequestHeader } from '@/common/constants'
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { TenancyService } from './tenancy.service'

@Injectable()
export class TenacyMiddleware implements NestMiddleware {
	constructor(private readonly tenancyService: TenancyService) {}

	async use(request: FastifyRequest['raw'], _: FastifyReply['raw'], next: (error?: Error | any) => void) {
		const tenantId = request.headers['x-tenant-id']
		if (!tenantId) {
			throw new BadRequestException('Tenant ID is required')
		}
		const tenant = this.tenancyService.findOneById(tenantId.toString())
		request[CommonRequestHeader.TENANT_HOST] = tenant.host
		next()
	}
}
