import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common'
import { Request } from 'express'
import { TenancyService } from './tenancy.service'

@Injectable()
export class TenacyMiddleware implements NestMiddleware {
	constructor(private readonly tenancyService: TenancyService) {}

	async use(req: Request, _, next: (error?: Error | any) => void) {
		const tenantId = req.headers['x-tenant-id']
		if (!tenantId) {
			throw new BadRequestException('Tenant ID is required')
		}
		const tenant = this.tenancyService.findOneById(tenantId.toString())
		req['tenancyHost'] = tenant.host
		next()
		// const dataSource = new DataSource({
		// 	...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
		// 	entities: [resolve(join(__dirname, '../**/*.entity.{ts,js}'))],
		// 	host: tenant.host
		// })
		// if (!dataSource.isInitialized) {
		// 	await dataSource.initialize()
		// }
		// req['dataSource'] = dataSource
	}
}
